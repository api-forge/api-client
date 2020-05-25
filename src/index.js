const fetch = require('node-fetch');
const isPlainObject = require('lodash/isPlainObject');
const isDate = require('lodash/isDate');
const omit = require('lodash/omit');
const AbortController = require('abort-controller');

// TODO: Add retries

class APIClient {
    constructor(options = {}) {
        this.protocol = options.protocol || 'https';
        this.hostname = options.hostname;
        this.port = options.port || 443;
        this.pathPrefix = options.pathPrefix || '/';
        this._secret = options.secret;

        this.commands = {
            create: 'POST',
            get: 'GET',
            list: 'GET',
            update: 'PUT',
            patch: 'PATCH',
            delete: 'DELETE',
            deletecollection: 'DELETE',
        };

        return this;
    }

    /**
     * Submits a request.
     *
     * @method request
     * @param {Object} options
     *   @param {string} options.resource
     *   @param {string} [options.command]
     *   @param {Object} [options.data]
     *   @param {string} [options.nonce]
     *   @param {Object} [options.query]
     *   @param {boolean} [options.noAuth = false]
     *   @param {boolean} [options.noReply = false]
     *   @param {string} [options.format = 'json']
     *   @param {number} [options.timeout]
     * @param {Function} [callback]
     */
    request(options = {}) {
        const format = options.format || 'json';
        const controller = new AbortController();
        const url = new URL(`${this.protocol}://${this.hostname}:${this.port}${this.pathPrefix}${options.resource}`);
        const command = options.command || 'get';
        const fetchOptions = {
            method: this.commands[command],
            headers: {
                'Content-Type': options.contentType || 'application/json; charset=utf-8',
            },
            signal: controller.signal,
        };
        let timeoutId = null;

        if (options.timeout) {
            timeoutId = setTimeout(() => { controller.abort(); }, options.timeout);
        }

        if (options.token) {
            fetchOptions.headers.Authorization = `Bearer ${options.token}`;
        } else if (this._secret) {
            fetchOptions.headers['X-Secret'] = this._secret;
        }

        // If a custom contentType is passed just assign the data
        if (options.contentType && options.data) {
            fetchOptions.body = options.data;
        } else if (options.data) {
            fetchOptions.body = JSON.stringify(options.data);
        }

        if (options.query) {
            Object.keys(options.query).forEach((key) => {
                const param = options.query[key];

                if (param === undefined) {
                    return;
                }

                if (Array.isArray(param)) {
                    param.forEach((value) => {
                        if (value === undefined) {
                            return;
                        }

                        url.searchParams.append(key, this._serializeSearchParam(value));
                    });
                } else {
                    url.searchParams.set(key, this._serializeSearchParam(param));
                }
            });
        }

        const promise = new Promise((resolve, reject) => {
            fetch(url, fetchOptions)
                .then(async response => {
                    let body = await response.text();
                    if (body.length && format === 'json') {
                        body = JSON.parse(body);
                    }

                    if (!response.ok) {
                        const error = new Error(body.message || body || response.statusText);
                        error.code = body.code || response.status;
                        reject(error);
                        return;
                    }

                    resolve(body);
                }).catch(error => {
                    reject(error);
                }).finally(() => {
                    clearTimeout(timeoutId);
                });
        });

        promise.cancel = () => {
            controller.abort();
        };

        return promise;
    }

    /**
     * Submits a `create` request.
     *
     * @method create
     * @param {Object} options
     *   @param {Object} options.data
     *   @param {string} options.resource
     *   @param {boolean} [options.noReply = false]
     * @return {Promise}
     */
    create(options) {
        return this.request(this._computeOptions('create', options));
    }

    /**
     * Submits a `delete` request.
     *
     * @method create
     * @param {Object} options
     *   @param {Object} options.resource
     *   @param {string} options.pk
     *   @param {boolean} [options.noReply = false]
     * @return {Promise}
     */
    delete(options) {
        return this.request(this._computeOptions('delete', options));
    }

    /**
     * Submits a `get` request.
     *
     * @method get
     * @param {Object} options
     *   @param {string} options.resource
     *   @param {string | Array} [options.pk]
     *   @param {string | Array} [options.except]
     *   @param {string | Array} [options.exclude]
     *   @param {string | Array} [options.groupBy]
     *   @param {string | Array} [options.include]
     *   @param {string | Object} [options.where]
     *   @param {number} [options.limit]
     *   @param {string} [options.nonce]
     *   @param {string} [options.order]
     *   @param {string} [options.orderBy]
     *   @param {number} [options.skip]
     *   @param {boolean} [options.changes = false]
     *   @param {boolean} [options.count = false]
     *   @param {boolean} [options.distinct = false]
     */
    get(options) {
        // Requesting
        return this.request(this._computeOptions('get', options));
    }

    /**
     * Submits a `list` request.
     *
     * @method list
     * @param {Object} options
     *   @param {string} options.resource
     *   @param {string | Array} [options.pk]
     *   @param {string | Array} [options.except]
     *   @param {string | Array} [options.exclude]
     *   @param {string | Array} [options.groupBy]
     *   @param {string | Array} [options.include]
     *   @param {string | Object} [options.where]
     *   @param {number} [options.limit]
     *   @param {string} [options.nonce]
     *   @param {string} [options.order]
     *   @param {string} [options.orderBy]
     *   @param {number} [options.skip]
     *   @param {boolean} [options.changes = false]
     *   @param {boolean} [options.count = false]
     *   @param {boolean} [options.distinct = false]
     */
    list(options) {
        // Requesting
        return this.request(this._computeOptions('list', options));
    }

    /**
     * Submits an `update` request.
     *
     * @method update
     * @param {Object} options
     *   @param {Object} options.data
     *   @param {string} options.resource
     *   @param {string | Array} options.pk
     *   @param {boolean} [options.noReply = false]
     */
    update(options) {
        return this.request(this._computeOptions('update', options));
    }


    /**
     * Creates an object to send a request to API FORGE.
     *
     * @method _serializeSearchParam
     * @param {any} param
     * @return {String}
     */
    _serializeSearchParam(param) {
        if (isDate(param)) {
            return param.toISOString();
        }

        if (isPlainObject(param)) {
            return JSON.stringify(param);
        }

        if (param === null) {
            return 'null';
        }

        return param.toString();
    }

    /**
     * Creates an object to send a request to API FORGE.
     *
     * @method _computeOptions
     * @param {String} command
     * @param {Object} options
     *   @param {Object} options.data
     *   @param {String} options.nonce
     *   @param {boolean} [options.noReply = false]
     *   @param {string} options.resource
     *   @param {string | Array} options.pk
     */
    _computeOptions(command, options) {
        const query = omit(options, [
            'data',
            'nonce',
            'noReply',
            'resource',
            'where',
            'timeout',
            'token',
        ]);

        if (options.pk) {
            query.pk = options.pk;
        }

        Object.assign(query, options.where);

        return {
            command,
            contentType: options.contentType,
            format: options.format,
            data: options.data,
            nonce: options.nonce,
            noReply: options.noReply,
            resource: options.resource,
            include: options.include,
            timeout: options.timeout,
            token: options.token,
            query,
        };
    }
}

module.exports = { APIClient };
