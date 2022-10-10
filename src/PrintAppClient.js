

class PrintAppClient {
	static NAME = 'print-app-client';
    static VERSION = '1.0';
	static ENDPOINTS = {
		cdnBase: 'https://editor.print.app/',
	};

	SELECTORS = { };
	handlers = {};
	
    
    model = {
        ui: {},
        env: {},
        act: {
            pipe: {}
        },
        lang: {},
        handlers : {},
		langCode: 'en',
        designs: new Map(),
    };

	constructor(params) {
		window.onmessage = this.handleMsg.bind(this);
		
		if (!params) return console.error('Parameters required but none passed');
		this.init(params);
	}
	
	init(params) {
	    this.model.env = {
			mode: 'new',
            customValues: {},
            ...params,
			parentWidth: window.innerWidth,
            parentHeight: window.innerHeight,
		};
		// validate();
		this.createUi();
	}
	async createUi() {
	    // TODO: Load client stylesheet..
		await PrintAppClient.loadStyle('styles/client.css');
		        
        this.model.ui.frame = this.makeFrame();
        this.createButtons();
        this.model.act.uiCreated = true;
		this.fire('ui:created');
		this.fire('app:ready');
	}
	makeFrame() {
		let frame = document.createElement('iframe');
        frame.src = `${PrintAppClient.ENDPOINTS.cdnBase}index.html`;
        frame.title = 'Print.App';
        
        // TODO: Handle display modes here...

		if (document.body) document.body.appendChild(frame);

		frame.classList.add('pa-frame');
		frame.classList.add(this.model.ui.displayMode);
        return frame;
	}
	showApp() {
		this.fire('app:before:show');
		this.model.act.bodyStyles = {
			overflow: document.body.style.overflow,
			position: document.body.style.position
		};
		document.body.style.overflow = document.documentElement.style.overflow = 'hidden';
        document.body.style.position = 'relative';

		PrintAppClient.scrollTo(document.documentElement, 0, 100);
		this.model.ui.frame.classList.add('shown');
		this.model.act.editorShown = false;
        this.setBtnPref();

		this.fire('app:after:show');
	}
	closeApp() {
        this.fire('app:before:close');
        
		this.model.ui.frame.classList.remove('shown');
		if (this.model.act.bodyStyles) {
			document.body.style.overflow = this.model.act.bodyStyles.overflow;
            document.body.style.position = this.model.act.bodyStyles.position;
        }
		document.documentElement.style.overflow = '';
        this.model.act.editorShown = false;
        this.setBtnPref();

		this.fire('app:after:close');
    }
	setBtnPref() {
		
	}
	createButtons() {
		// TODO: Create the buttons..
	}
	validate() {
		this.comm('init', { apiKey: this.vars.apiKey, userId: this.vars.userId, client: this.vars.client }, 'POST')
            .then(_data => {
                if (_data.error) return false;
                
                this.fire('client-validated', _data);
                this.model.env = _data.validation;
                this.model.config = _data.config;
                this.model.act.validated = true;
                
                if (typeof this.vars.customizationRequired !== 'undefined') this.model.config.customizationRequired = Boolean(this.vars.customizationRequired);
                if (typeof this.vars.pdfDownload !== 'undefined') this.model.config.pdfDownload = Boolean(this.vars.pdfDownload);
                
                this._makeTag('script', this.model.config.customJs);
                this._makeTag('style', this.model.config.customCss);
                
                if (typeof this[_cb] === 'function') {
                    this[_cb]();
                    this._loadLang();
                } else {
                    this._loadLang();
                    this.createUi();
                }
            })
            .catch(console.log);
	}
	
	handleMsg (event) {
		console.log('message from app');
		const data = PrintAppClient.parse(event.data);
		if (data) {
			switch (data.event) {
				case 'print-app':

				break;
			}
		}
	}

	// Always use this to prevent JS from crashing due to parsing errors
	static parse(string) {
		if (!string) return;
		try {
			return JSON.parse(string);
		} catch (e) { console.error(e) }
	}

	on (type, fnc) {
		let handlers = this.handlers[type], i, len;
		if (typeof handlers === 'undefined') handlers = this.handlers[type] = [];
		for (i = 0, len = handlers.length; i < len; i++) {
			if (handlers[i] === fnc) return;
		}
		handlers.push(fnc);
	}

	off (type, fnc) {
		let handlers = this.handlers[type], i, len;
		if (handlers instanceof Array) {
			for (i = 0, len = handlers.length; i < len; i++) {
				if (handlers[i] === fnc) {
					handlers.splice(i, 1);
					break;
				}
			}
		}
	}

	fire (type, data) {
		let handlers = this.handlers[type], i, len,
			event = { type: type, data: data };
		if (handlers instanceof Array) {
			handlers = handlers.concat();
			for (i = 0, len = handlers.length; i < len; i++) {
				handlers[i].call(this, event);
			}
		}
	}

	static comm(url, data, method = 'POST') {
        return new Promise(async (respond, reject) => {
			let cType, formData;
				
			if (data && method === 'GET') {
				formData = [];
				for (let _key in data) {
					if (typeof data[_key] !== 'undefined' && data[_key] !== null) formData.push(encodeURIComponent(_key) + '=' + encodeURIComponent(data[_key]));
				}
				formData = formData.join('&').replace(/%20/g, '+');
			}
			if (method === 'POST' || method === 'PUT') {
				cType = 'application/x-www-form-urlencoded';
				if (data) formData = JSON.stringify(data);
			} else if (method === 'GET') {
				cType = 'text/plain';
				if (formData) url += `?${formData}`;
				formData = undefined;
			}
			
			if (url.indexOf('//s3') === 0) url = `https:${url}`;
			if (url.indexOf('https://') !== 0) url = `${PrintAppClient.ENDPOINTS.apiBase}${url}`;
			
			const   headers = new window.Headers();
			headers.append('Content-Type', cType);
			
			window.fetch(url, {
					method: method,
					headers: headers,
					body: formData
				})
				.then(_ => {
					if (_) {
						return _.json();
					} else {
						throw new Error('Communication error');
					}
				})
				.then(_data => {
					if (_data && _data.message && _data.statusCode && _data.statusCode > 299) return reject(_data.message);
					if (typeof _data.sessToken !== 'undefined') {
						Storage.setSessToken(_data.sessToken);
						delete _data.sessToken;
					}
					respond(_data);
				})
				.catch(reject);
		});
	}

	static async loadStyle(url) {
		return new Promise((resolve, reject) => {
			url = `${PrintAppClient.ENDPOINTS.cdnBase}${url}`;
			const tag = document.createElement('link');
			tag.rel = 'stylesheet';
			if (document.head) document.head.appendChild(tag);
			tag.onload = resolve;
			tag.href = url;
		});
	}
	static scrollTo(e, t, s) {
        if (s <= 0) return;
        let i = (t - e.scrollTop) / s * 10;
        setTimeout(()=>{
            e.scrollTop = e.scrollTop + i,
            e.scrollTop !== t && this._scrollTo(e, t, s - 10)
        } ,10);
    }
}