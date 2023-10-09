
	class PrintAppClient {
		static NAME = 'print-app-client';
		static EDITOR_NAME = 'print-app-editor';
		static VERSION = '1.0';
		static ENDPOINTS = {
			cdnBase: 'https://editor.print.app/',
			frameDomain: 'https://editor.print.app'
		};

		SELECTORS = {
			miniSelector: '#main > div.row > div:nth-child(1),.single-product-thumbnail,#content > div > div.col-sm-8 > ul.thumbnails',
			cartButton: '.single_add_to_cart_button,.kad_add_to_cart,.addtocart,#add-to-cart,.add_to_cart,#add,#AddToCart,#product-add-to-cart,#add_to_cart,#button-cart,#AddToCart-product-template,.product-details-wrapper .add-to-cart,.btn-addtocart,.ProductForm__AddToCart,.add_to_cart_product_page,#addToCart,[name="add"],[data-button-action="add-to-cart"]'
		};
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
			if (params.previews) {
				if (typeof params.previews === 'string') params.previews = JSON.parse(params.previews);
				this.model.session.previews = params.previews;
			}
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
			this.model.ui.dummyDiv = document.createElement('div');
			this.createCommandUI();
			this.model.ui.cartButton = document.querySelector(this.SELECTORS.cartButton);
			this.model.act.uiCreated = true;
			this.fire('ui:created');
			window.addEventListener('resize', () => this.adjustFramePos())
		}
		makeFrame() {
			let frame = document.createElement('iframe');
			frame.src = `${PrintAppClient.ENDPOINTS.cdnBase}index.html`;
			frame.title = 'Print.App';
			
			// TODO: Handle display modes here...

			if (document.body) document.body.appendChild(frame);

			frame.classList.add('printapp-frame');
			frame.classList.add('printapp-display-modal');
			return frame;
		}
		async createCommandUI() {
			this.model.ui.base = document.querySelector(this.model.env.commandSelector || '#pa-buttons');
			if (!this.model.ui.base) return;
			await PrintAppClient.loadTag(`https://editor.print.app/js/petite-vue.js`);
	
			// Using Petite-Vue's syntax for data binding
			this.model.ui.base.innerHTML = `
			<div id="print-app-container" class="printapp-commands" v-scope>
				<button v-if="buttons.showCustomize" @click.prevent.stop="showApp" class="button">{{lang[ buttons.editMode ? 'resume' : 'customize' ]}}</button>
				<button v-if="buttons.showClear" @click.prevent.stop="clearDesign" class="button">{{lang.clear}}</button>
			</div>`;

			this.ui = PetiteVue.reactive({
				lang: {
					customize: 'Personalise Design',
					resume: 'Resume Design',
					clear: 'Clear Design',
				},
				buttons: {
					showCustomize: true,
					showClear: false,
					editMode: false,
				},
				showApp: this.showApp.bind(this),
				clearDesign: this.clearDesign.bind(this)
			})

			PetiteVue.createApp(this.ui).mount('#print-app-container')
		
			this.setCommandPref()
			this.updatePreviews()
		}
		
		setCommandPref() {
			if (this.model.state.shown && ['mini', 'inline'].includes(this.model.ui.displayMode)) {
				this.ui.buttons.showCustomize = false;
				this.ui.buttons.editMode = false;
				this.ui.buttons.showClear = this.model.state.mode === 'edit-project';
				return;
			}

			switch (this.model.state.mode) {
				case 'edit-project':
					this.ui.buttons.showCustomize = true;
					this.ui.buttons.editMode = true;
					this.ui.buttons.showClear = true;
				break;
				default:
					this.ui.buttons.showCustomize = true;
					this.ui.buttons.editMode = false;
					this.ui.buttons.showClear = false;
				break;
			}
		}
		showApp() {
			this.fire('app:before:show');
			this.model.act.bodyStyles = {
				overflow: document.body.style.overflow,
				position: document.body.style.position
			};

			document.body.style.position = 'relative';
			this.model.ui.frame.classList.add('printapp-shown');

			switch (this.model.ui.displayMode) {
				case 'inline':
					this.model.ui.dummyDiv.style['max-height'] = '700px';
					this.model.ui.frame.style['max-height'] = '700px';
				break;
				case 'mini':

				break;
				default:
					document.body.style.overflow = document.documentElement.style.overflow = 'hidden';
				break;
			}
			
			setTimeout(_ => this.model.ui.frame.style.filter = 'none', 1e3);
			this.model.state.shown = true;
			this.adjustFramePos();
			this.sendMsg('app:show');
			this.setCommandPref();

			this.fire('app:after:show');
		}

		adjustFramePos() {
			if (!this.model.state.shown || !['mini', 'inline'].includes(this.model.ui.displayMode)) return;
			
			const coords = PrintAppClient.getRootCoords(this.model.ui.dummyDiv)
			this.model.ui.frame.style['margin-left'] = `${coords.left}px`
			this.model.ui.frame.style['margin-top'] = `${coords.top}px`
			this.model.ui.frame.style.width = `${coords.width}px`
			this.model.ui.dummyDiv.style['margin-bottom'] = '3rem'
		}

		handleCartBtn() {
			if (this.model?.settings?.forceCustomization && this.model.ui.cartButton) {
				if (this.model.state.mode === 'new-project') {
					if (this.model.ui.cartButton.style.display != 'none') this.model.ui.cartButtonStyle = this.model.ui.cartButton.style.display;
					this.model.ui.cartButton.style.display = 'none';
				} else {
					this.model.ui.cartButton.style.display = this.model.ui.cartButtonStyle || 'block';
				}
			}
		}
		close() {
			// proxy to closeApp...
			this.closeApp();
		}
		closeApp() {
			this.fire('app:before:close');
			
			this.model.ui.frame.classList.remove('printapp-shown');
			if (this.model.act.bodyStyles) {
				document.body.style.overflow = this.model.act.bodyStyles.overflow;
				document.body.style.position = this.model.act.bodyStyles.position;
			}
			document.documentElement.style.overflow = '';
			switch (this.model.ui.displayMode) {
				case 'inline':
					this.model.ui.frame.style['max-height'] = '0';
					this.model.ui.dummyDiv.style['max-height'] = '0';
				break;
				default:
				
				break;
			}
			this.model.state.shown = false;
			this.setCommandPref();

			this.fire('app:after:close');
		}
		saved(value) {
			this.model.session = value;
			this.model.state.mode = 'edit-project';
		}
		clearDesign() {
			this.model.state.mode = 'new-project';
			this.setCommandPref();
			this.fire('app:project:reset', { projectId: this.model.session.projectId });
		}
		updatePreviews() {
			if (this.model?.settings?.retainProductImages) return;
			if (!this.model?.env?.previewsSelector) return;

			var previews = (this.model?.session?.previews) || this.model.env.previews;
			if (typeof previews === 'string') previews = PrintAppClient.parse(previews);

			const previewBase = document.querySelector(this.model.env.previewsSelector);
			if (!previewBase || !previews || !previews.length) return;

			previewBase.innerHTML =
				`<div class="printapp-previews">
					<div class="printapp-previews-main">
						<img src="${previews[0].url}"/>
					</div>
					<div class="printapp-previews-thumbnails">
						${(previews.length > 1) ? previews.map(p => `<div><img src="${p.url}" onclick="if (window.printAppInstance) window.printAppInstance.changeMainPreviewImage(this.src)"/></div>`).join('') : ''}
					</div>
				</div>`;
		}
		changeMainPreviewImage(newSrc) {
			const mainImage = document.querySelector('.printapp-previews-main img');
			if (mainImage) mainImage.src = newSrc;
		}

		appReady() {
			if (this.model.env.autoShow) this.showApp();
		}

		handleDisplayMode() {

			switch (this.model.ui.displayMode) {
				case 'inline':
					this.model.ui.frame.classList.remove('printapp-display-modal');
					this.model.ui.frame.classList.remove('printapp-display-mini');
					this.model.ui.frame.classList.add('printapp-display-inline');
					this.model.ui.dummyDiv.classList.add('printapp-display-inline-div');
					this.model.ui.frameParent = document.querySelector(this.model.settings.inlineSelector || '[null]');
				break;
				case 'mini':
					this.model.ui.frame.classList.remove('printapp-display-modal');
					this.model.ui.frame.classList.remove('printapp-display-inline');
					this.model.ui.frame.classList.add('printapp-display-mini');
					this.model.ui.dummyDiv.classList.add('printapp-display-mini-div');
					this.model.ui.frameParent = document.querySelector(this.model.settings.miniSelector || this.SELECTORS.mini);
					if (this.model.ui.frameParent)
						this.model.ui.frameParent.innerHTML = '';
				break;
				default:
					this.model.ui.frame.classList.add('printapp-display-modal');
					this.model.ui.frame.classList.remove('printapp-display-inline');
					this.model.ui.frame.classList.remove('printapp-display-mini');
				break;
			}

			if (this.model.ui.frameParent) {
				if (this.model.ui.frameParent)
					this.model.ui.frameParent.insertBefore(this.model.ui.dummyDiv, this.model.ui.frameParent.firstChild);
			} else {
				this.model.ui.frame.classList.add('printapp-display-modal');
				this.model.ui.frame.classList.remove('printapp-display-inline');
				this.model.ui.frame.classList.remove('printapp-display-mini');
				this.model.ui.displayMode = 'modal';
			}

		}
		validationComplete() {
			this.handleCartBtn()
			this.model.ui.displayMode = this.model.settings.displayMode || 'modal';
			this.handleDisplayMode();
			if (this.model.ui.displayMode === 'mini') this.showApp();
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
					case 'app:ready':
						this.appReady();
						this.fire(message.event, message.data);
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
					case 'app:validation:success':
						this.model.settings = message.data.settings;
						this.fire(message.event, message.data);
						this.validationComplete()
					break;
					case 'app:validation:failed':
						this.unload(message.data);
						this.fire(message.event, message.data);
					break;
					case 'element:create':
						this.createElement(message.data)
					break;
					case 'element:listen':
						this.hookElement(message.data)
					break;
					case 'element:update':
						this.updateElement(message.data)
					break;
					default:
						this.fire(message.event, message.data);
					break;
				}
			}
		}

		updateElement(data) {
			if (!data?.selector) return;
			const element = document.querySelector(data.selector);
			if (!element) return;

			switch (element.tagName) {
				case 'SELECT':
					element.selectedIndex = data.selectedIndex;
				break;
				case 'INPUT':
					element.value = data.value;
				break;
			}
		}

		createElement(data) {
			if (!data) return;
			let element = '';
			switch (data.type || data._type) {
				case 'label':
					element = `<label style="margin-bottom:5px">${data.value}</label><br/>`
				break;
				case 'pagesUpload':
					element = `<button style="margin-bottom:5px" class="button">Upload File</button><br/>`
				break;
				case 'size':
					element = `<select style="margin-bottom:5px"><option value="A4">A4</option><option value="A3">A3</option><option value="A3">A2</option><option value="A3">A1</option></select><br/>`
				break;
			}
			console.log(data, element);
			jQuery('#pa-buttons').prepend(element);
		}

		hookElement(data) {
			if (!data?.selector) return;
			const element = document.querySelector(data.selector);
			if (!element) return;

			const elementValues = target => {
				switch (target.tagName) {
					case 'SELECT':
						return {
							value: target.value,
							text: target.options[target.selectedIndex].text,
							values: [...target.options].map(o => ({ value: o.value, text: o.text, selected: o.selected })),
							selectedIndex: target.selectedIndex,
						};
					case 'INPUT':
						return {
							value: target.value,
							checked: target.checked,
						}
				}
			};

			// send the initial value...
			this.sendMsg(data.callbackEvent, {
				selector: data.selector,
				...elementValues(element),
				event: 'init'
			})

			// then add the event listener...
			element.addEventListener('change', e => {
				this.sendMsg(data.callbackEvent, {
					selector: data.selector,
					...elementValues(e.target),
					event: 'change'
				})
			})
		}

		unload(data) {
			if (this.model.ui.base) {
				this.model.ui.base.innerHTML = typeof data === 'string' ? data : '';
			}
			if (this.model.ui.frame && this.model.ui.frame.parentNode) {
				this.model.ui.frame.parentNode.removeChild(this.model.ui.frame);
			}
		}

		// Always use this to prevent JS from crashing due to json parsing errors
		static parse(string) {
			if (!string) return;
			try {
				let data = JSON.parse(string);
				return data || string;
			} catch (e) {  }
		}

		on (type, fnc) {	// proxy to addEventListener
			this.addEventListener(type, fnc);
		}
		addEventListener (type, fnc) {
			let handlers = this.handlers[type], i, len;
			if (typeof handlers === 'undefined') handlers = this.handlers[type] = [];
			for (i = 0, len = handlers.length; i < len; i++) {
				if (handlers[i] === fnc) return;
			}
			handlers.push(fnc);
		}

		off (type, fnc) {		// proxy to removeEventListener
			this.removeEventListener(type, fnc);
		}
		removeEventListener (type, fnc) {
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

		static async comm(url, data, method = 'POST', useFormData = false) {
			let cType, formData;
				
			if (data && method === 'GET') {
				formData = [];
				for (let _key in data) {
					if (typeof data[_key] !== 'undefined' && data[_key] !== null) formData.push(encodeURIComponent(_key) + '=' + encodeURIComponent(data[_key]));
				}
				formData = formData.join('&').replace(/%20/g, '+');
			} else if (method === 'POST' || method === 'PUT') {
				if (useFormData) {
					cType = 'multipart/form-data';
					formData = new window.FormData();
					for (let _key in data) {
						if (typeof data[_key] !== 'undefined' && data[_key] !== null) formData.append(_key, data[_key]);
					}
				} else {
					cType = 'application/x-www-form-urlencoded';
					if (data) formData = JSON.stringify(data);
				}
			} else if (method === 'GET') {
				cType = 'text/plain';
				if (formData) url += `?${formData}`;
				formData = undefined;
			}
			
			if (url.indexOf('//s3') === 0) url = `https:${url}`;
			if (url.indexOf('https://') !== 0) url = `${PrintAppClient.ENDPOINTS.apiBase}${url}`;
			
			const   headers = new window.Headers();
			if (cType) headers.append('Content-Type', cType);
			
			window.fetch(url, { method: method, headers: headers, body: formData })
				.then(d => {
					return d ? PrintAppClient.parse(d) : d;
				}).then(response => {
					if (response?.message?.statusCode && response.statusCode > 299) return response.message;
					if (response && (typeof response.sessToken !== 'undefined')) {
						Storage.setSessToken(response.sessToken);
						delete response.sessToken;
					}
					return response;
				})
		}

		static getRootCoords(elem) {
			let rect = elem.getBoundingClientRect();
		
			// get scroll positions
			let scrollTop = window.pageYOffset || document.documentElement.scrollTop;
			let scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
		
			// calculate and return the coordinates
			return {
				top: rect.top + scrollTop,
				left: rect.left + scrollLeft,
				width: rect.width,
				height: rect.height
			};
		}

		static async loadTag(url, attrs = {}) {
			return new Promise((resolve) => {
				var tag;
				if (url.endsWith('.css')) {
					tag = document.createElement('link');
					tag.rel = 'stylesheet';
					if (document.head) document.head.appendChild(tag);
					tag.href = url;
				} else if (url.endsWith('.js')) {
					tag = document.createElement('script');
					if (document.head) document.head.appendChild(tag)
					for (let attr in attrs) tag.setAttribute(attr, attrs[attr]);
					tag.src = url
				}
				tag.onload = resolve;
			})
		}
		static scrollTo(e, t, s) {
			if (s <= 0) return;
			let i = (t - e.scrollTop) / s * 10;
			setTimeout(()=>{
				e.scrollTop = e.scrollTop + i,
				e.scrollTop !== t && this.scrollTo(e, t, s - 10)
			}, 10)
		}
		addStyling() {
			const styling = `
				.printapp-frame{ overflow: hidden; border: none; z-index: -10; position: fixed; pointer-events: none; transform: scale(0); filter: brightness(0.6); transition: transform .3s ease-out .2s, filter .3s ease-out .4s; }
				.printapp-frame.printapp-shown{ display: block; z-index: 999999999; pointer-events: auto; transform: scale(1); filter: brightness(0.6); }
				.printapp-commands { display: flex; flex-direction: column; gap: 1rem; margin-bottom: 1rem; }
				.printapp-commands>*{ max-width: 35rem; margin-left: 0; }

				.printapp-frame.printapp-shown.printapp-display-modal { left:0; top: 0; right:0; bottom: 0; width: 100vw; height: 100vh; }
				.printapp-display-inline {
					width: 100%;
					height: 700px;
					top: 0;
					left: 0;
					max-height: 0;
					position: absolute;
					transition: max-height 0.6s cubic-bezier(.05,.59,.14,1);
					border-bottom: 1px solid #64748b4d;
				}
				.printapp-display-inline-div {
					width: 100%;
					height: 700px;
					max-height: 0;
					display: block;
					transition: max-height 0.6s cubic-bezier(.05,.59,.14,1);
				}
				.printapp-display-mini {
					width: 100%;
					height: 700px;
					top: 0;
					left: 0;
					position: absolute;
				}
				.printapp-display-mini-div {
					width: 100%;
					height: 700px;
					display: block;
					transition: max-height 0.6s cubic-bezier(.05,.59,.14,1);
				}
				
				.printapp-previews {
					width: 100%;
					height: 100%;
					overflow: hidden;
					display: flex;
					flex-direction: column;
					align-items: center;
				}
				
				.printapp-previews > .printapp-previews-main {
					max-width: 90%;
					max-height: 70%;
					white-space: nowrap;
					margin-bottom: 20px;
				}
				
				.printapp-previews > .printapp-previews-main > img {
					max-width: 100%;
					max-height: 100%;
					display: block;
				}
				
				.printapp-previews > .printapp-previews-thumbnails {
					display: flex;
					height: 100px;
					justify-content: flex-start;
					align-items: center;
					overflow-x: auto;
					overflow-y: hidden;
					white-space: nowrap;
				}
				
				.printapp-previews > .printapp-previews-thumbnails::-webkit-scrollbar {
					width: 10px;
				}
				
				.printapp-previews > .printapp-previews-thumbnails::-webkit-scrollbar-thumb {
					background-color: darkgrey;
					outline: 1px solid slategrey;
				}
				
				.printapp-previews > .printapp-previews-thumbnails > div {
					width: 100px;
					height: 100px;
					margin: 0 5px;
					cursor: pointer;
					display: flex;
					justify-content: center;
					align-items: center;
				}
				
				.printapp-previews > .printapp-previews-thumbnails > div > img {
					max-width: 100%;
					max-height: 100%;
				}			  
			`;

			const tag = document.createElement('style');
			tag.setAttribute('type', 'text/css');
			tag.appendChild(document.createTextNode(styling));
			if (document.head) document.head.appendChild(tag);
		}
	}