import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs/Subject';
import 'rxjs/add/operator/takeUntil';

import * as moment from 'moment';
import * as _ from 'lodash';

import { Org } from 'app/models/organization';
import { Project } from 'app/models/project';
import { SearchTerms } from 'app/models/search';

import { TableObject } from 'app/shared/components/table-template/table-object';
import { TableParamsObject } from 'app/shared/components/table-template/table-params-object';
import { TableTemplateUtils } from 'app/shared/utils/table-template-utils';
import { Constants } from 'app/shared/utils/constants';

import { ProjectListTableRowsComponent } from './project-list-table-rows/project-list-table-rows.component';

import { OrgService } from 'app/services/org.service';
import { SearchService } from 'app/services/search.service';
import { StorageService } from 'app/services/storage.service';
import { ConfigService } from 'app/services/config.service';

class ProjectFilterObject {
  constructor(
    public type: object = {},
    public eacDecision: object = {},
    public decisionDateStart: object = {},
    public decisionDateEnd: object = {},
    public pcp: object = {},
    public proponent: Array<Org> = [],
    public region: Array<string> = [],
    public CEAAInvolvement: Array<string> = [],
    public vc: Array<object> = []
  ) {}
}

@Component({
  selector: 'app-project-list',
  templateUrl: './project-list.component.html',
  styleUrls: ['./project-list.component.scss']
})
export class ProjectListComponent implements OnInit, OnDestroy {
  public projects: Array<Project> = [];
  public proponents: Array<Org> = [];
  public regions: Array<object> = [];
  public ceaaInvolvements: Array<object> = [];
  public eacDecisions: Array<any> = [];
  public commentPeriods: Array<object> = [];
  public projectTypes: Array<object> = [];

  public loading = true;

  public tableParams: TableParamsObject = new TableParamsObject();
  public terms = new SearchTerms();

  public filterForURL: object = {};
  public filterForAPI: object = {};

  public filterForUI: ProjectFilterObject = new ProjectFilterObject();

  public showAdvancedSearch = true;

  public showFilters: object = {
    type: false,
    eacDecision: false,
    pcp: false,
    more: false
  };

  public numFilters: object = {
    type: 0,
    eacDecision: 0,
    pcp: 0,
    more: 0
  };

  public projectTableData: TableObject;
  public projectTableColumns: any[] = [
    {
      name: 'Name',
      value: 'name',
      width: 'col-2'
    },
    {
      name: 'Proponent',
      value: 'proponent.name',
      width: 'col-2'
    },
    {
      name: 'Type',
      value: 'type',
      width: 'col-2'
    },
    {
      name: 'Region',
      value: 'region',
      width: 'col-2'
    },
    {
      name: 'Phase',
      value: 'currentPhaseName',
      width: 'col-2'
    },
    {
      name: 'Decision',
      value: 'eacDecision',
      width: 'col-2'
    }
  ];

  private ngUnsubscribe: Subject<boolean> = new Subject<boolean>();

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private tableTemplateUtils: TableTemplateUtils,
    private storageService: StorageService,
    private searchService: SearchService,
    private orgService: OrgService,
    private config: ConfigService,
    private _changeDetectionRef: ChangeDetectorRef
  ) {}

  ngOnInit() {
      // Fetch proponents
      this.orgService
        .getByCompanyType('Proponent/Certificate Holder')
        .switchMap((res: any) => {
          if (res) {
            this.proponents = res || [];
            return this.config.lists;
          } else {
          alert('Uh-oh, couldn\'t load proponents');
          this.router.navigate(['/']);
        }
        })
        .switchMap((list: any) => {
          list.map(item => {
            switch (item.type) {
              case 'eaDecisions':
                this.eacDecisions.push({ ...item });
                break;
              case 'ceaaInvolvements':
                this.ceaaInvolvements.push({ ...item });
                break;
            }
          });

          this.regions = Constants.REGIONS_COLLECTION;
          this.commentPeriods = Constants.PCP_COLLECTION;
          this.projectTypes = Constants.PROJECT_TYPE_COLLECTION;

          return this.route.params;
        })
        .switchMap((res: any) => {
          let params = { ...res };

          this.setFiltersFromParams(params);

          this.updateCounts();

          this.tableParams = this.tableTemplateUtils.getParamsFromUrl(
            params,
            this.filterForURL
          );

          if (this.tableParams.sortBy === '') {
            this.tableParams.sortBy = '+name';
          }

          return this.searchService
            .getSearchResults(
              this.tableParams.keywords,
              'Project',
              [],
              this.tableParams.currentPage,
              this.tableParams.pageSize,
              this.tableParams.sortBy,
              {},
              true,
              null,
              this.filterForAPI,
              ''
            );
        })
        .takeUntil(this.ngUnsubscribe)
        .subscribe((res: any) => {
          if (res[0].data) {
            if (res[0].data.searchResults.length > 0) {
              this.tableParams.totalListItems =
                res[0].data.meta[0].searchResultsTotal;
              this.projects = res[0].data.searchResults;
            } else {
              this.tableParams.totalListItems = 0;
              this.projects = [];
            }
            this.setRowData();
          } else {
            alert('Uh-oh, couldn\'t load search results');
            // results not found --> navigate back to search
            this.router.navigate(['/']);
          }
          this.loading = false;
          this._changeDetectionRef.detectChanges();
        });

  }

  addProject() {
    this.storageService.state.back = {
      url: ['/projects'],
      label: 'All Projects(s)'
    };
    this.router.navigate(['/projects', 'add']);
  }

  paramsToCheckboxFilters(params, name, map) {
    this.filterForUI[name] = {};
    delete this.filterForURL[name];
    delete this.filterForAPI[name];

    if (params[name]) {
      this.filterForURL[name] = params[name];

      const values = params[name].split(',');
      let apiValues = [];
      values.forEach(value => {
        this.filterForUI[name][value] = true;
        apiValues.push(map && map[value] ? map[value] : value);
      });
      if (apiValues.length) {
        this.filterForAPI[name] = apiValues.join(',');
      }
    }
  }

  paramsToCollectionFilters(params, name, collection, identifyBy) {
    this.filterForUI[name] = [];
    delete this.filterForURL[name];
    delete this.filterForAPI[name];

    if (params[name] && collection) {
      let confirmedValues = [];
      // look up each value in collection
      const values = params[name].split(',');
      values.forEach(value => {
        const record = _.find(collection, [identifyBy, value]);
        if (record) {
          this.filterForUI[name].push(record);
          confirmedValues.push(value);
        }
      });
      if (confirmedValues.length) {
        this.filterForURL[name] = confirmedValues.join(',');
        this.filterForAPI[name] = confirmedValues.join(',');
      }
    }
  }

  paramsToDateFilters(params, name) {
    this.filterForUI[name] = null;
    delete this.filterForURL[name];
    delete this.filterForAPI[name];

    if (params[name]) {
      this.filterForURL[name] = params[name];
      this.filterForAPI[name] = params[name];
      // NGB Date
      const date = moment(params[name]).toDate();
      this.filterForUI[name] = {
        year: date.getFullYear(),
        month: date.getMonth() + 1,
        day: date.getDate()
      };
    }
  }

  setFiltersFromParams(params) {
    this.paramsToCollectionFilters(params, 'type', this.projectTypes, 'code');
    this.paramsToCollectionFilters(params, 'pcp', this.commentPeriods, 'code');
    this.paramsToCollectionFilters(params, 'region', this.regions, 'code');
    this.paramsToCollectionFilters(params, 'CEAAInvolvement', this.ceaaInvolvements, '_id');
    this.paramsToCollectionFilters(params, 'proponent', this.proponents, '_id');
    this.paramsToCollectionFilters(params, 'vc', null, '_id');
    this.paramsToCollectionFilters(params, 'eacDecision', this.eacDecisions, '_id');

    this.paramsToDateFilters(params, 'decisionDateStart');
    this.paramsToDateFilters(params, 'decisionDateEnd');
  }

  checkboxFilterToParams(params, name) {
    let keys = [];
    Object.keys(this.filterForUI[name]).forEach(key => {
      if (this.filterForUI[name][key]) {
        keys.push(key);
      }
    });
    if (keys.length) {
      params[name] = keys.join(',');
    }
  }

  collectionFilterToParams(params, name, identifyBy) {
    if (this.filterForUI[name].length) {
      const values = this.filterForUI[name].map(record => {
        return record[identifyBy];
      });
      params[name] = values.join(',');
    }
  }

  isNGBDate(date) {
    return date && date.year && date.month && date.day;
  }

  dateFilterToParams(params, name) {
    if (this.isNGBDate(this.filterForUI[name])) {
      const date = new Date(
        this.filterForUI[name].year,
        this.filterForUI[name].month - 1,
        this.filterForUI[name].day
      );
      params[name] = moment(date).format('YYYY-MM-DD');
    }
  }

  setParamsFromFilters(params) {
    this.collectionFilterToParams(params, 'type', 'code');
    this.collectionFilterToParams(params, 'pcp', 'code');
    this.collectionFilterToParams(params, 'eacDecision', '_id');
    this.collectionFilterToParams(params, 'region', 'code');
    this.collectionFilterToParams(params, 'CEAAInvolvement', '_id');
    this.collectionFilterToParams(params, 'proponent', '_id');
    this.collectionFilterToParams(params, 'vc', '_id');

    this.dateFilterToParams(params, 'decisionDateStart');
    this.dateFilterToParams(params, 'decisionDateEnd');
  }

  toggleFilter(name) {
    if (this.showFilters[name]) {
      this.updateCount(name);
      this.showFilters[name] = false;
    } else {
      Object.keys(this.showFilters).forEach(key => {
        if (this.showFilters[key]) {
          this.updateCount(key);
          this.showFilters[key] = false;
        }
      });
      this.showFilters[name] = true;
    }
  }

  isShowingFilter() {
    return Object.keys(this.showFilters).some(key => {
      return this.showFilters[key];
    });
  }

  clearAll() {
    Object.keys(this.filterForUI).forEach(key => {
      if (this.filterForUI[key]) {
        if (Array.isArray(this.filterForUI[key])) {
          this.filterForUI[key] = [];
        } else if (typeof this.filterForUI[key] === 'object') {
          this.filterForUI[key] = {};
        } else {
          this.filterForUI[key] = '';
        }
      }
    });
    this.updateCounts();
  }

  updateCount(name) {
    const getCount = n => {
      return Object.keys(this.filterForUI[n]).filter(
        k => this.filterForUI[n][k]
      ).length;
    };

    let num = 0;
    if (name === 'more') {
      num =
        getCount('region') +
        this.filterForUI.proponent.length +
        getCount('CEAAInvolvement') +
        this.filterForUI.vc.length;
    } else {
      num = getCount(name);
      if (name === 'eacDecision') {
        num += this.isNGBDate(this.filterForUI.decisionDateStart) ? 1 : 0;
        num += this.isNGBDate(this.filterForUI.decisionDateEnd) ? 1 : 0;
      }
    }
    this.numFilters[name] = num;
  }

  updateCounts() {
    this.updateCount('type');
    this.updateCount('eacDecision');
    this.updateCount('pcp');
    this.updateCount('more');
  }

  setRowData() {
    let projectList = [];
    if (this.projects && this.projects.length > 0) {
      this.projects.forEach(project => {
        projectList.push({
          _id: project._id,
          name: project.name,
          proponent: project.proponent,
          type: project.type,
          region: project.region,
          currentPhaseName: project.currentPhaseName,
          eacDecision: project.eacDecision
        });
      });
      this.projectTableData = new TableObject(
        ProjectListTableRowsComponent,
        projectList,
        this.tableParams
      );
    }
  }

  setColumnSort(column) {
    if (this.tableParams.sortBy.charAt(0) === '+') {
      this.tableParams.sortBy = '-' + column;
    } else {
      this.tableParams.sortBy = '+' + column;
    }
    this.getPaginatedProjects(this.tableParams.currentPage);
  }

  getPaginatedProjects(pageNumber) {
    // Go to top of page after clicking to a different page.
    window.scrollTo(0, 0);
    this.loading = true;

    this.tableParams = this.tableTemplateUtils.updateTableParams(
      this.tableParams,
      pageNumber,
      this.tableParams.sortBy
    );

    this.searchService
      .getSearchResults(
        this.tableParams.keywords,
        'Project',
        null,
        pageNumber,
        this.tableParams.pageSize,
        this.tableParams.sortBy,
        {},
        true,
        null,
        this.filterForAPI,
        ''
      )
      .takeUntil(this.ngUnsubscribe)
      .subscribe((res: any) => {
        if (res && res[0].data) {
          this.tableParams.totalListItems =
            res[0].data.meta[0].searchResultsTotal;
          this.projects = res[0].data.searchResults;
          this.tableTemplateUtils.updateUrl(
            this.tableParams.sortBy,
            this.tableParams.currentPage,
            this.tableParams.pageSize,
            this.filterForURL,
            this.tableParams.keywords
          );
          this.setRowData();
          this.loading = false;
          this._changeDetectionRef.detectChanges();
        } else {
          alert('Uh-oh, couldn\'t load topics');
          // project not found --> navigate back to search
          this.router.navigate(['/']);
        }
      });
  }

  public onSubmit(currentPage = 1) {
    // dismiss any open snackbar
    // if (this.snackBarRef) { this.snackBarRef.dismiss(); }

    // NOTE: Angular Router doesn't reload page on same URL
    // REF: https://stackoverflow.com/questions/40983055/how-to-reload-the-current-route-with-the-angular-2-router
    // WORKAROUND: add timestamp to force URL to be different than last time

    let params = this.terms.getParams();
    params['ms'] = new Date().getMilliseconds();
    params['dataset'] = this.terms.dataset;
    params['currentPage'] = this.tableParams.currentPage;
    params['sortBy'] = this.tableParams.sortBy = '-score';
    params['keywords'] = this.tableParams.keywords;
    params['pageSize'] = this.tableParams.pageSize

    this.setParamsFromFilters(params);

    console.log('onSubmit params', params);
    this.router.navigate(['projects-list', params]);
  }

  private getLists() {
    this.config.lists.subscribe(lists => {
      lists.map(item => {
        switch (item.type) {
          case 'eaDecisions':
            this.eacDecisions.push({ ...item });
            break;
          case 'ceaaInvolvements':
            this.ceaaInvolvements.push({ ...item });
            break;
        }
      });
    });
  }

  // Compares selected options when a dropdown is grouped by legislation.
  compareDropdownOptions(optionA: any, optionB: any) {
    if ((optionA.name === optionB.name) && (optionA.legislation === optionB.legislation)) {
      return true;
    }

    return false;
  }

  clearSelectedItem(filter: string, item: any) {
    this.filterForUI[filter] = this.filterForUI[filter].filter(option => option._id !== item._id);
  }

  ngOnDestroy() {
    this.ngUnsubscribe.next();
    this.ngUnsubscribe.complete();
  }
}
