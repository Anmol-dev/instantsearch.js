import algoliasearchHelper from 'algoliasearch-helper';
import mergeWith from 'lodash/mergeWith';
import union from 'lodash/union';
import isPlainObject from 'lodash/isPlainObject';
import EventEmitter from 'events';
import { Index } from '../widgets/index/index';
// import RoutingManager from './RoutingManager';
// import simpleMapping from './stateMappings/simple';
// import historyRouter from './routers/history';
// import version from './version';
import createHelpers from './createHelpers';

// const ROUTING_DEFAULT_OPTIONS = {
//   stateMapping: simpleMapping(),
//   router: historyRouter(),
// };

function defaultCreateURL() {
  return '#';
}

const createChildHelper = ({ parent, client, index, parameters }) => {
  const helper = algoliasearchHelper(client, index, parameters);

  helper.search = () => {
    parent.search();
  };

  return helper;
};

/**
 * The actual implementation of the InstantSearch. This is
 * created using the `instantsearch` factory function.
 * @fires Instantsearch#render This event is triggered each time a render is done
 */
class InstantSearch extends EventEmitter {
  constructor(options) {
    super();

    const {
      indexName = null,
      numberLocale,
      searchParameters = {},
      // routing = null,
      // searchFunction,
      stalledSearchDelay = 200,
      searchClient = null,
    } = options;

    //     if (indexName === null || searchClient === null) {
    //       throw new Error(`Usage: instantsearch({
    //   indexName: 'indexName',
    //   searchClient: algoliasearch('appId', 'apiKey')
    // });`);
    //     }

    //     if (typeof options.urlSync !== 'undefined') {
    //       throw new Error(
    //         'InstantSearch.js V3: `urlSync` option has been removed. You can now use the new `routing` option'
    //       );
    //     }

    //     if (typeof searchClient.search !== 'function') {
    //       throw new Error(
    //         'The search client must implement a `search(requests)` method.'
    //       );
    //     }

    //     if (typeof searchClient.addAlgoliaAgent === 'function') {
    //       searchClient.addAlgoliaAgent(`instantsearch.js ${version}`);
    //     }

    this.client = searchClient;

    this.tree = {
      parent: null,
      helper: algoliasearchHelper(this.client, indexName, {
        ...searchParameters,
        index: indexName,
      }),
      indices: [],
      widgets: [],
    };

    this.templatesConfig = {
      helpers: createHelpers({ numberLocale }),
      compileOptions: {},
    };

    this._stalledSearchDelay = stalledSearchDelay;

    // if (searchFunction) {
    //   this._searchFunction = searchFunction;
    // }

    // if (routing === true) this.routing = ROUTING_DEFAULT_OPTIONS;
    // else if (isPlainObject(routing))
    //   this.routing = {
    //     ...ROUTING_DEFAULT_OPTIONS,
    //     ...routing,
    //   };
  }

  addWidget(widget) {
    this.addWidgets([widget]);
  }

  addWidgets(widgets) {
    if (!Array.isArray(widgets)) {
      throw new Error(
        'You need to provide an array of widgets or call `addWidget()`'
      );
    }

    // The routing manager widget is always added manually at the last position.
    // By removing it from the last position and adding it back after, we ensure
    // it keeps this position.
    // fixes #3148
    // const lastWidget = this.widgets.pop();

    widgets.forEach(widget => {
      if (widget.render === undefined && widget.init === undefined) {
        throw new Error('Widget definition missing render or init method');
      }

      let current = this.tree;

      if (widget instanceof Index) {
        const node = {
          // @TODO: resolve parent
          parent: this.tree,
          helper: createChildHelper({
            parent: this.tree.helper,
            client: this.client,
            index: widget.indexName,
            parameters: {
              ...this.tree.helper.getState(),
              index: widget.indexName,
            },
          }),
          indices: [],
          widgets: widget.widgets,
        };

        this.tree.indices.push(node);

        // useful to trigger the N requets
        const derivedHelper = this.tree.helper.derive(parameters => {
          // @TODO: resolve the search parameters from the tree
          // node.helper.getState() -> node.parent.helper.getState()
          return algoliasearchHelper.SearchParameters.make({
            ...parameters,
            ...node.helper.getState(),
          });
        });

        derivedHelper.on('result', this._render.bind(this, node.helper));

        current = node;
      }

      current.helper.setState(
        enhanceConfiguration()(
          {
            ...current.helper.getState(),
          },
          widget
        )
      );

      current.widgets.push(widget);
    });

    // Second part of the fix for #3148
    // if (lastWidget) this.widgets.push(lastWidget);

    // Init the widget directly if instantsearch has been already started
    // if (this.started && Boolean(widgets.length)) {
    //   this.searchParameters = this.widgets.reduce(enhanceConfiguration({}), {
    //     ...this.helper.state,
    //   });

    //   this.helper.setState(this.searchParameters);

    //   widgets.forEach(widget => {
    //     if (widget.init) {
    //       widget.init({
    //         state: this.helper.state,
    //         helper: this.helper,
    //         templatesConfig: this.templatesConfig,
    //         createURL: this._createAbsoluteURL,
    //         onHistoryChange: this._onHistoryChange,
    //         instantSearchInstance: this,
    //       });
    //     }
    //   });

    //   this.helper.search();
    // }
  }

  // /**
  //  * Removes a widget. This can be done after the InstantSearch has been started. This feature
  //  * is considered **EXPERIMENTAL** and therefore it is possibly buggy, if you find anything please
  //  * [open an issue](https://github.com/algolia/instantsearch.js/issues/new?title=Problem%20with%20removeWidget).
  //  * @param  {Widget} widget The widget instance to remove from InstantSearch. This widget must implement a `dispose()` method in order to be gracefully removed.
  //  * @return {undefined} This method does not return anything
  //  */
  // removeWidget(widget) {
  //   this.removeWidgets([widget]);
  // }

  // /**
  //  * Removes multiple widgets. This can be done only after the InstantSearch has been started. This feature
  //  * is considered **EXPERIMENTAL** and therefore it is possibly buggy, if you find anything please
  //  * [open an issue](https://github.com/algolia/instantsearch.js/issues/new?title=Problem%20with%20addWidgets).
  //  * @param  {Widget[]} widgets Array of widgets instances to remove from InstantSearch.
  //  * @return {undefined} This method does not return anything
  //  */
  // removeWidgets(widgets) {
  //   if (!Array.isArray(widgets)) {
  //     throw new Error(
  //       'You need to provide an array of widgets or call `removeWidget()`'
  //     );
  //   }

  //   widgets.forEach(widget => {
  //     if (
  //       !this.widgets.includes(widget) ||
  //       typeof widget.dispose !== 'function'
  //     ) {
  //       throw new Error(
  //         'The widget you tried to remove does not implement the dispose method, therefore it is not possible to remove this widget'
  //       );
  //     }

  //     this.widgets = this.widgets.filter(w => w !== widget);

  //     const nextState = widget.dispose({
  //       helper: this.helper,
  //       state: this.helper.getState(),
  //     });

  //     // re-compute remaining widgets to the state
  //     // in a case two widgets were using the same configuration but we removed one
  //     if (nextState) {
  //       this.searchParameters = this.widgets.reduce(enhanceConfiguration({}), {
  //         ...nextState,
  //       });

  //       this.helper.setState(this.searchParameters);
  //     }
  //   });

  //   // If there's multiple call to `removeWidget()` let's wait until they are all made
  //   // and then check for widgets.length & make a search on next tick
  //   //
  //   // This solves an issue where you unmount a page and removing widget by widget
  //   setTimeout(() => {
  //     // no need to trigger a search if we don't have any widgets left
  //     if (this.widgets.length > 0) {
  //       this.helper.search();
  //     }
  //   }, 0);
  // }

  // /**
  //  * Clears the cached answers from Algolia and triggers a new search.
  //  *
  //  * @return {undefined} Does not return anything
  //  */
  // refresh() {
  //   if (this.helper) {
  //     this.helper.clearCache().search();
  //   }
  // }

  /**
   * Ends the initialization of InstantSearch.js and triggers the
   * first search. This method should be called after all widgets have been added
   * to the instance of InstantSearch.js. InstantSearch.js also supports adding and removing
   * widgets after the start as an **EXPERIMENTAL** feature.
   *
   * @return {undefined} Does not return anything
   */
  start() {
    if (this.started) throw new Error('start() has been already called once');

    // if (this.routing) {
    //   const routingManager = new RoutingManager({
    //     ...this.routing,
    //     instantSearchInstance: this,
    //   });
    //   // this._onHistoryChange = routingManager.onHistoryChange.bind(
    //   //   routingManager
    //   // );
    //   this._createURL = routingManager.createURL.bind(routingManager);
    //   this._createAbsoluteURL = this._createURL;
    //   this.tree.widgets.push(routingManager);
    // } else {
    this._createURL = defaultCreateURL;
    this._createAbsoluteURL = defaultCreateURL;
    this._onHistoryChange = function() {};
    // }

    // if (this._searchFunction) {
    //   this._mainHelperSearch = helper.search.bind(helper);
    //   helper.search = () => {
    //     const helperSearchFunction = algoliasearchHelper(
    //       {
    //         search: () => new Promise(() => {}),
    //       },
    //       helper.state.index,
    //       helper.state
    //     );
    //     helperSearchFunction.once('search', state => {
    //       helper.overrideStateWithoutTriggeringChangeEvent(state);
    //       this._mainHelperSearch();
    //     });
    //     this._searchFunction(helperSearchFunction);
    //   };
    // }

    this._searchStalledTimer = null;
    this._isSearchStalled = true;

    this._init();

    this.tree.helper.on('search', () => {
      if (!this._isSearchStalled && !this._searchStalledTimer) {
        this._searchStalledTimer = setTimeout(() => {
          this._isSearchStalled = true;
          this._render(
            this.tree.helper,
            this.tree.helper.lastResults,
            this.tree.helper.lastResults._state
          );
        }, this._stalledSearchDelay);
      }
    });

    this.tree.helper.on('result', this._render.bind(this, this.tree.helper));

    this.tree.helper.on('error', e => this.emit('error', e));

    this.tree.helper.search();

    // track we started the search if we add more widgets,
    // to init them directly after add
    this.started = true;
  }

  // /**
  //  * Removes all widgets without triggering a search afterwards. This is an **EXPERIMENTAL** feature,
  //  * if you find an issue with it, please
  //  * [open an issue](https://github.com/algolia/instantsearch.js/issues/new?title=Problem%20with%20dispose).
  //  * @return {undefined} This method does not return anything
  //  */
  // dispose() {
  //   this.removeWidgets(this.widgets);
  //   // You can not start an instance two times, therefore a disposed instance needs to set started as false
  //   // otherwise this can not be restarted at a later point.
  //   this.started = false;

  //   // The helper needs to be reset to perform the next search from a fresh state.
  //   // If not reset, it would use the state stored before calling `dispose()`.
  //   this.helper.removeAllListeners();
  //   this.helper = null;
  // }

  // createURL(params) {
  //   if (!this._createURL) {
  //     throw new Error('You need to call start() before calling createURL()');
  //   }
  //   return this._createURL(this.helper.state.setQueryParameters(params));
  // }

  _init() {
    const walk = node => {
      node.widgets.forEach(widget => {
        if (widget.init) {
          widget.init({
            state: node.helper.getState(),
            helper: node.helper,
            templatesConfig: this.templatesConfig,
            createURL: this._createAbsoluteURL,
            onHistoryChange: this._onHistoryChange,
            instantSearchInstance: this,
          });
        }
      });

      return node.indices.forEach(inner => walk(inner));
    };

    walk(this.tree);
  }

  _render(helper, results, state) {
    const walk = node => {
      if (node.helper === helper) {
        node.widgets.forEach(widget => {
          if (widget.render) {
            widget.render({
              templatesConfig: this.templatesConfig,
              results,
              state,
              helper: node.helper,
              createURL: this._createAbsoluteURL,
              instantSearchInstance: this,
              searchMetadata: {
                isSearchStalled: this._isSearchStalled,
              },
            });
          }
        });
      }

      return node.indices.forEach(inner => walk(inner));
    };

    if (!this.tree.helper.hasPendingRequests()) {
      clearTimeout(this._searchStalledTimer);
      this._searchStalledTimer = null;
      this._isSearchStalled = false;
    }

    walk(this.tree);

    this.emit('render');
  }
}

export function enhanceConfiguration(searchParametersFromUrl) {
  return (configuration, widgetDefinition) => {
    if (!widgetDefinition.getConfiguration) return configuration;

    // Get the relevant partial configuration asked by the widget
    const partialConfiguration = widgetDefinition.getConfiguration(
      configuration,
      searchParametersFromUrl
    );

    const customizer = (a, b) => {
      // always create a unified array for facets refinements
      if (Array.isArray(a)) {
        return union(a, b);
      }

      // avoid mutating objects
      if (isPlainObject(a)) {
        return mergeWith({}, a, b, customizer);
      }

      return undefined;
    };

    return mergeWith({}, configuration, partialConfiguration, customizer);
  };
}

export default InstantSearch;
