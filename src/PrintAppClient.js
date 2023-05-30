
class PrintAppClient {
	static NAME = 'print-app-client';
	static EDITOR_NAME = 'print-app-editor';
	static VERSION = '1.0';
	static ENDPOINTS = {
		cdnBase: 'https://editor.print.app/',
		frameDomain: 'https://editor.print.app'
	};

	SELECTORS = { };
	handlers = { };
	
    model = {
        ui: { commands: { }},
        env: {},
        state: {
			shown: false,
			closed: false,
			saved: false,
		},
        act: {
            pipe: {}
        },
		session: {},
        lang: {},
        handlers : {},
		langCode: 'en',
        designs: new Map(),
        projects: new Map(),
    };

	constructor(params) {
		window.onmessage = this.handleMsg.bind(this);
		
		if (!params) return console.error('Parameters required but undefined was passed'); 
		this.init(params);
	}
	
	init(params) {
	    this.model.env = {
			isAdmin: false,
            customValues: {},
			parentWidth: window.innerWidth,
            parentHeight: window.innerHeight,
            ...params,
		};
		this.model.state.mode = params.mode || 'new-project';
		this.createUi();
	}
	async createUi() {
		this.fire('ui:create');
		this.addStyling();
		        
        this.model.ui.frame = this.makeFrame();
		this.createCommandUI();
        this.model.act.uiCreated = true;
		this.fire('ui:created');
	}
	makeFrame() {
		let frame = document.createElement('iframe');
        frame.src = `${PrintAppClient.ENDPOINTS.cdnBase}index.html`;
        frame.title = 'Print.App';
        
        // TODO: Handle display modes here...

		if (document.body) document.body.appendChild(frame);

		frame.classList.add('pa-frame');
		frame.classList.add(this.model.ui.displayMode || 'pa-modal');
        return frame;
	}
	async createCommandUI() {
		if (!this.model.env.commandSelector) return;
		const base = document.querySelector(this.model.env.commandSelector);
		if (!base) return;
		await PrintAppClient.loadTag(`https://editor.print.app/js/rivets.bundled.min.js`);		// bundle with client..

		this.model.ui.commands = {
			lang: {
				customize: 'Personalise Design',
				resume: 'Resume Design',
				clear: 'Clear Design',
			},
			customize_click: (e) => {
				e.preventDefault();
				e.stopPropagation();
				this.showApp();
			},
			clear_click: (e) => {
				e.preventDefault();
				e.stopPropagation();
				this.clearDesign();
			}
		};
		base.innerHTML = `<div class="pa-commands">
					<button rv-unless="resume" rv-on-click="customize_click" class="button">{lang.customize}</button>
					<button rv-if="resume" rv-on-click="customize_click" class="button">{lang.resume}</button>
					<button rv-if="clear" rv-on-click="clear_click" class="button">{lang.clear}</button>
					<div>`;
		rivets.bind(base, this.model.ui.commands);
		this.setCommandPref();
	}
	setCommandPref() {
		switch (this.model.state.mode) {
			case 'edit-project':
				this.model.ui.commands.resume = true;
				this.model.ui.commands.clear = true;
			break;
			default:
			case 'new-project':
				this.model.ui.commands.resume = false;
				this.model.ui.commands.clear = false;
			break;
		}
	}
	showApp() {
		this.fire('app:before:show');
		this.model.act.bodyStyles = {
			overflow: document.body.style.overflow,
			position: document.body.style.position
		};
		document.body.style.overflow = document.documentElement.style.overflow = 'hidden';
        document.body.style.position = 'relative';

		this.model.ui.frame.classList.add('pa-shown');
		setTimeout(_ => this.model.ui.frame.style.filter = 'none', 1000);
		this.model.state.shown = true;
		this.sendMsg('app:show');
        this.setCommandPref();

		this.fire('app:after:show');
	}
	closeApp() {
        this.fire('app:before:close');
        
		this.model.ui.frame.classList.remove('pa-shown');
		if (this.model.act.bodyStyles) {
			document.body.style.overflow = this.model.act.bodyStyles.overflow;
            document.body.style.position = this.model.act.bodyStyles.position;
        }
		document.documentElement.style.overflow = '';
		this.model.state.shown = false;
        this.setCommandPref();

		this.fire('app:after:close');
    }
	saved(value) {
		this.model.session = value;
		this.model.state.mode = value.mode;
	}
	clearDesign() {
		this.model.state.mode = 'new-project';
		this.setCommandPref();
		this.fire('app:project:reset', { projectId: this.model.session.projectId });
	}
	updatePreviews() {
		if (!this.model.env.previewsSelector) return;
		const { previews } = this.model.session;
		const base = document.querySelector(this.model.env.previewsSelector);
		if (!base || !previews || !previews.length) return;
		base.innerHTML = `<div class="pa-previews"><div class="pa-previews-main">` +
							previews.map(p => `<div><img src="${p.url}"/></div>`).join('')
						+ `</div></div>`;
	}
	sendMsg(event, data, handle) {
		const message = JSON.stringify({ event, data });

		const handler = handle || this.model.ui.messageSource;
		if (!handler) return false;
		handler.postMessage(message, PrintAppClient.ENDPOINTS.frameDomain);
	}

	handleMsg (event) {
		if (event.origin !== PrintAppClient.ENDPOINTS.frameDomain) return;
		
		const message = PrintAppClient.parse(event.data);

		if (message) {
			switch (message.event) {
				case PrintAppClient.EDITOR_NAME:
					this.model.ui.messageSource = event.source;
					this.sendMsg(PrintAppClient.NAME, this.model.env);
				break;
				case 'app:saved':
					this.model.state.saved = true;
					this.saved(message.data);
					this.fire(message.event, message.data);
					this.closeApp();
					this.setCommandPref();
					this.updatePreviews();
				break;
				case 'app:closed':
					this.model.state.closed = true;
					this.fire(message.event, message.data);
					this.closeApp();
					this.setCommandPref();
				break;
				default:
					this.fire(message.event, message.data);
				break;
			}
		}
	}

	// Always use this to prevent JS from crashing due to json parsing errors
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

	static async comm(url, data, method = 'POST') {
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
				if (_data && _data.message && _data.statusCode && _data.statusCode > 299) return _data.message;
				if (typeof _data.sessToken !== 'undefined') {
					Storage.setSessToken(_data.sessToken);
					delete _data.sessToken;
				}
				return _data;
			});
	}

	static async loadTag(url) {
		return new Promise((resolve) => {
            var tag;
            if (url.endsWith('.css')) {
                tag = document.createElement('link');
			    tag.rel = 'stylesheet';
		        if (document.head) document.head.appendChild(tag);
                tag.href = url;
            } else if (url.endsWith('.js')) {
                tag = document.createElement('script');
		        if (document.head) document.head.appendChild(tag);
                tag.src = url;
            }
			tag.onload = resolve;
		});
	}
	static scrollTo(e, t, s) {
        if (s <= 0) return;
        let i = (t - e.scrollTop) / s * 10;
        setTimeout(()=>{
            e.scrollTop = e.scrollTop + i,
            e.scrollTop !== t && this.scrollTo(e, t, s - 10)
        }, 10);
    }
	addStyling() {
		const styling = `
			.pa-frame{ overflow: hidden; border: none; z-index: -10; position: fixed; pointer-events: none; transform: scale(0); filter: brightness(0.6); transition: transform .3s ease-out .2s, filter .3s ease-out .4s; }
			.pa-frame.pa-shown{ display: block; z-index: 999999999; pointer-events: auto; transform: scale(1); filter: brightness(0.6); }
			.pa-frame.pa-shown.pa-modal{ left:0; top: 0; right:0; bottom: 0; width: 100vw; height: 100vh; }
			.pa-commands { display: flex; flex-direction: column; gap: 10px; }
			.pa-commands>*{ max-width: 18rem; margin-left: 0; }
			.pa-previews{ width:100%; height: 100%; overflow-x: auto; }
			.pa-previews>.pa-previews-main{ white-space: nowrap; }
			.pa-previews>.pa-previews-main>div{ display: inline-block; }
		`;
		const tag = document.createElement('style');
		tag.setAttribute('type', 'text/css');
		tag.appendChild(document.createTextNode(styling));
		if (document.head) document.head.appendChild(tag);
	}
}