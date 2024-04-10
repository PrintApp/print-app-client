
	class PrintAppClient {
		static NAME = 'print-app-client';
		static EDITOR_NAME = 'print-app-editor';
		static VERSION = '1.0';
		static ENDPOINTS = {
			cdnBase: 'https://editor.print.app/',
			frameDomain: 'https://editor.print.app'
		};

		static SELECTORS = {
			miniSelector: '#main > div.row > div:nth-child(1),.single-product-thumbnail,#content > div > div.col-sm-8 > ul.thumbnails',
			cartButton: '.single_add_to_cart_button,.kad_add_to_cart,.addtocart,#add-to-cart,.add_to_cart,#add,#AddToCart,#product-add-to-cart,#add_to_cart,#button-cart,#AddToCart-product-template,.product-details-wrapper .add-to-cart,.btn-addtocart,.ProductForm__AddToCart,.add_to_cart_product_page,#addToCart,[name="add"],[data-button-action="add-to-cart"],[data-action="add-to-cart"]',
			mini: ''
		};
		handlers = { };
		
		model = {
			ui: { commands: { } },
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
			isMobile: window.innerWidth < 1024,
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
				settings: {},
				isAdmin: false,
				customValues: {},
				parentWidth: window.innerWidth,
				parentHeight: window.innerHeight,
				mode: 'new-project',
				...params,
			};
			this.model.state.mode = params.mode || 'new-project';
			if (this.model.env.noInstance) {
				this.managePage();
			} else {
				this.createUi();
			}
		}
		async createUi() {
			this.fire('ui:create');
			this.loadStyling();
					
			this.model.ui.frame = this.makeFrame();
			this.setMainDiv();
			this.handleDisplayMode();
			this.createCommandUI();
			this.model.ui.cartButton = document.querySelector(PrintAppClient.SELECTORS.cartButton);
			this.model.act.uiCreated = true;
			this.runCustomScripts();
			this.fire('ui:created');
		}
		makeFrame() {
			let frame = document.createElement('iframe');
			frame.src = `${PrintAppClient.ENDPOINTS.cdnBase}index.html`;
			frame.title = 'Print.App';
			frame.classList.add('printapp-frame');
			return frame;
		}

		setMainDiv() {
			this.model.ui.base = document.querySelector(this.model.env.commandSelector || '#pa-buttons');
		}

		handleDisplayMode() {
			if (!this.model.env.settings.displayMode) this.model.env.settings.displayMode = 'modal';

			// if (this.model.isMobile && this.model.ui.base) {
			// 	this.model.ui.frame.classList.add('printapp-display-mini');
			// 	this.model.ui.frame.classList.add('printapp-app-is-mobile');
			// 	this.model.ui.frame.classList.remove('printapp-display-inline');
			// 	this.model.ui.frame.classList.remove('printapp-display-modal');

			// 	this.model.ui.frameParent = this.model.ui.base.parentNode;
			// 	this.model.ui.frameParent?.insertBefore?.(this.model.ui.frame, this.model.ui.base);
			// 	if (this.model.ui.frameParent) return;
			// }
			
			switch (this.model.env.settings.displayMode) {
				case 'mini':
					this.model.ui.frame.classList.remove('printapp-display-modal');
					this.model.ui.frame.classList.remove('printapp-display-inline');
					this.model.ui.frame.classList.add('printapp-display-mini');
					this.model.ui.frameParent = document.querySelector(this.model.env.settings.miniSelector || PrintAppClient.SELECTORS.mini);
					if (this.model.ui.frameParent) {
						this.model.ui.frameParent.innerHTML = '';
						this.model.ui.frameParent.appendChild(this.model.ui.frame);
					}
				break;
				case 'inline':
					this.model.ui.frame.classList.remove('printapp-display-modal');
					this.model.ui.frame.classList.remove('printapp-display-mini');
					this.model.ui.frame.classList.add('printapp-display-inline');
					this.model.ui.frameParent = document.querySelector(this.model.env.settings.inlineSelector || '[null]');
					this.model.ui.frameParent?.insertBefore?.(this.model.ui.frame, this.model.ui.frameParent.firstChild);
				break;
				default:
					document.body.appendChild(this.model.ui.frame);
					this.model.ui.frame.classList.add('printapp-display-modal');
					this.model.ui.frame.classList.remove('printapp-display-inline');
					this.model.ui.frame.classList.remove('printapp-display-mini');
				break;
			}

			if (!this.model.ui.frameParent) {
				this.model.ui.frame.classList.add('printapp-display-modal');
				this.model.ui.frame.classList.remove('printapp-display-inline');
				this.model.ui.frame.classList.remove('printapp-display-mini');
				this.model.ui.displayMode = 'modal';
			}

		}

		runCustomScripts() {
			if (this.model?.env?.settings?.customCss) {
				const tag = document.createElement('style');
				tag.setAttribute('type', 'text/css');
				tag.appendChild(document.createTextNode(this.model.env.settings.customCss));
				if (document.head) document.head.appendChild(tag);
			}
			if (this.model?.env?.settings?.customJs) {
				const tag = document.createElement('script');
				tag.setAttribute('type', 'text/javascript');
				tag.appendChild(document.createTextNode(this.model.env.settings.customJs));
				if (document.head) document.head.appendChild(tag);
			}
		}
		async createCommandUI() {
			if (!this.model.ui.base) return;
			await PrintAppClient.loadTag(`https://editor.print.app/js/petite-vue.js`);

			if (this.model?.env?.settings?.moveButtonsBefore) {
				const base = document.querySelector(this.model.env.settings.moveButtonsBefore);
				if (base) base.parentNode.insertBefore(this.model.ui.base, base);
			}
	
			// Using Petite-Vue's syntax for data binding
			const buttonClasses = this.model.env.settings.buttonsClass || 'button';
			this.model.ui.base.innerHTML = `
				<div id="print-app-container" class="printapp-commands" v-scope>
					<div class="printapp-commands-items">
						<div v-for="item in items" class="printapp-commands-item">
							<div v-if="item.type === 'label'" class="label">
								<label>{{item.title}}</label>
							</div>
							<div v-if="['button', 'upload'].includes(item.type)">
								<button @click.prevent.stop="clickEvt" :data-cmd="item.id" :name="item.id" class="button btn btn-primary">{{item.title}}</button>
							</div>
							<div v-if="item.type === 'input'">
								<label>{{item.title}}:</label>
								<input @input="inputEvt" class="input" :type="item.inputType" :name="item.id" :placeholder="item.placeholder || ''" v-model="item.value" />
							</div>
							<div v-if="item.type === 'number'">
								<label>{{item.title}}:</label>
								<input @input="inputEvt" class="input" type="number" :name="item.id" :max="item.maxValue" :min="item.minValue" :type="item.inputType" :name="item.id" :placeholder="item.placeholder || ''" v-model="item.value" />
							</div>
							<div v-if="item.type === 'textarea'">
								<label>{{item.title}}:</label>
								<textarea @input="inputEvt" :row="item.rows" :name="item.id" :placeholder="item.placeholder || ''" v-model="item.value"></textarea>
							</div>
							<div @change="changeEvt" v-if="item.type === 'select'">
								<label>{{item.title}}:</label>
								<select :value="item.value" :name="item.id">
									<option v-for="option in item.options" v-model="option.value">{{option.title || option.value}}</option>
								</select>
							</div>
							<div @change="changeEvt" v-if="item.type === 'switch'" class="switch-div">
								<label :for="item.id">{{item.title}}</label>
								<label class="switch">
									<input :name="item.id" v-model="item.value" type="checkbox" />
									<span class="slider"></span>
								</label>
							</div>
							<div @change="changeEvt" v-if="item.type === 'option'">
								<label>{{item.title}}:</label>
								<div v-for="option in item.options" class="option">
									<input type="radio" :name="option.id" v-model="option.value" />
									<label :for="option.id"></label>
								</div>
							</div>
						</div>
					</div>
					<button v-if="buttons.showCustomize" @click.prevent.stop="showApp" class="${buttonClasses} btn btn-primary">{{lang[ buttons.editMode ? 'resume' : 'customize' ]}}</button>
					<button v-if="buttons.showUpload" @click.prevent.stop="showApp" data-cmd="artwork" class="${buttonClasses} btn btn-primary">{{lang.upload_artwork}}</button>
					<button v-if="buttons.showClear" @click.prevent.stop="clearDesign" class="${buttonClasses} btn btn-primary">{{lang.clear}}</button>
				</div>`

			this.model.ui.vue = PetiteVue.reactive({
				lang: this.model.env.language || {
					customize: 'Personalise Design',
					upload_artwork: 'Upload your Artwork',
					resume: 'Resume Design',
					clear: 'Clear Design',
				},
				buttons: {
					showCustomize: true,
					showUpload: false,
					showClear: false,
					editMode: false,
				},
				items: [],
				showApp: this.showApp.bind(this),
				clearDesign: this.clearDesign.bind(this),
				clickEvt: this.controlClick.bind(this),
				changeEvt: this.controlChange.bind(this),
				inputEvt: this.controlInput.bind(this),
			})

			PetiteVue.createApp(this.model.ui.vue).mount('#print-app-container')
		
			this.setCommandPref()
			this.updatePreviews()
		}

		controlClick(event) {
			let id = event?.target?.name,
				item = this.model.ui.vue.items.find(i => i.id === id);

			this.sendMsg('control:change', { eventType: 'click', data: item });
		}
		controlChange(event) {
			let id = event?.target?.name,
				item = this.model.ui.vue.items.find(i => i.id === id);

			this.sendMsg('control:change', { eventType: 'change', data: item });
		}
		controlInput(event) {
			let id = event?.target?.name,
				item = this.model.ui.vue.items.find(i => i.id === id);

			this.sendMsg('control:change', { eventType: 'input', data: item })
		}

		createControl(data) {
			if (!data?.type) return;
			this.model.ui.vue.items.push(data);
		}
		
		setCommandPref() {
			if (!this.model.ui.vue) return;
			if (this.model.state.shown && ['mini', 'inline'].includes(this.model.env.settings.displayMode)) {
				this.model.ui.vue.buttons.showCustomize = false;
				this.model.ui.vue.buttons.showUpload = false;
				this.model.ui.vue.buttons.editMode = false;
				this.model.ui.vue.buttons.showClear = this.model.state.mode === 'edit-project'
				return;
			}

			if (this.model?.env?.artworkId?.length) {
				this.model.ui.vue.buttons.showUpload = true;
				if (!this.model.env?.designList?.length)
					return this.model.ui.vue.buttons.showCustomize = false;
			} else {
				this.model.ui.vue.buttons.showUpload = false;
			}

			switch (this.model.state.mode) {
				case 'edit-project':
					this.model.ui.vue.buttons.showCustomize = true;
					this.model.ui.vue.buttons.editMode = true;
					this.model.ui.vue.buttons.showClear = true;
				break;
				default:
					this.model.ui.vue.buttons.showCustomize = true;
					this.model.ui.vue.buttons.editMode = false;
					this.model.ui.vue.buttons.showClear = false;
				break;
			}
		}
		
		showApp(event) {
			this.fire('app:before:show');
			this.model.act.bodyStyles = {
				overflow: document.body.style.overflow,
				position: document.body.style.position
			};

			document.body.style.position = 'relative';
			this.model.ui.frame.classList.add('printapp-shown');

			if (!this.model.isMobile) {
				switch (this.model.env.settings.displayMode) {
					case 'inline':
						this.model.ui.frame.style['max-height'] = '700px';
						this.model.ui.frame.style['margin-bottom'] = '2rem';
					break;
					case 'mini':
						this.model.ui.frameParent.style['min-height'] = '700px';
					break;
					default:
						document.body.style.overflow = document.documentElement.style.overflow = 'hidden';
					break;
				}
			} else {
				if (this.model.ui.frameParent) this.model.ui.frameParent.style['min-height'] = '100vh';
			}
			
			setTimeout(_ => this.model.ui.frame.style.filter = 'none', 1e3);
			this.model.state.shown = true;
			this.sendMsg('app:show', {
				artwork: event?.target?.dataset?.cmd === 'artwork',
			});
			this.setCommandPref();

			this.fire('app:after:show');
		}

		handleCartBtn() {
			if (this.model?.env?.settings?.forceCustomization && this.model.ui.cartButton) {
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
			switch (this.model.env.settings.displayMode) {
				case 'mini':
				case 'inline':
					this.model.ui.frame.style['max-height'] = '0';
					this.model.ui.frame.style['margin-bottom'] = '0';
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
			if (this.model?.env?.settings?.retainProductImages) return;
			if (!this.model?.env?.previewsSelector && !this.model?.env?.settings?.customPreviewSelector) return;

			var previews = (this.model?.session?.previews) || this.model.env.previews;
			if (typeof previews === 'string') previews = PrintAppClient.parse(previews);

			const previewBase = document.querySelector(this.model?.env?.settings?.customPreviewSelector || this.model.env.previewsSelector);
			if (!previewBase || !previews?.length) return;

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

		validationComplete() {
			this.handleCartBtn()
			if (this.model.env.settings.displayMode === 'mini') this.showApp();
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
						
						if (message.data && message.data.mode && !message.data.mode.includes('artwork'))
							message.data.mode = 'edit-project';

						this.saved(message.data);
						this.fire(message.event, message.data);
						this.closeApp();
						this.setCommandPref();
						this.updatePreviews();
						this.handleCartBtn();
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
					case 'control:create':
						this.createControl(message.data)
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

			this.model.state._pauseDispatch = true;

			switch (element.tagName) {
				case 'SELECT':
					if (typeof element.selectedIndex !== 'undefined') element.selectedIndex = data.selectedIndex;
					if (typeof element.value !== 'undefined') element.value = data.value;
					element.dispatchEvent(new window.Event('change', { bubbles: true }));
				break;
				case 'INPUT':
					element.value = data.value;
					element.dispatchEvent(new window.Event('input', { bubbles: true }));
				break;
			}
			setTimeout(() => this.model.state._pauseDispatch = false, 100);
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
						};
				}
				return {};
			};

			// send the initial value...
			this.sendMsg(data.callbackEvent, {
				selector: data.selector,
				...elementValues(element),
				event: 'init'
			})

			// then add the event listener...
			element.addEventListener('change', e => {
				if (this.model.state._pauseDispatch) return;

				this.sendMsg(data.callbackEvent, {
					selector: data.selector,
					...elementValues(e.target),
					event: 'change',
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

		manageCartPage() {
			switch (this.model.state.client) {
				case 'ps':

				break;
			}
		}
		managePage() {
			if (this.model.state.page === 'cart') return this.manageCartPage();
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
			setTimeout(() => {
				e.scrollTop = e.scrollTop + i,
				e.scrollTop !== t && this.scrollTo(e, t, s - 10)
			}, 10)
		}
		loadStyling() {
			const tag = document.createElement('link');
			tag.setAttribute('rel', 'stylesheet');
			tag.href = `${PrintAppClient.ENDPOINTS.cdnBase}css/style.css`;
			document?.head?.appendChild?.(tag);
		}
	}