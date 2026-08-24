
(function(global) {
	
    if (!global.PrintAppClient) {
	
		global.PrintAppClient = class {
			static NAME = 'print-app-client';
			static EDITOR_NAME = 'print-app-editor';
			static VERSION = '1.0';
			static ENDPOINTS = {
				cdnBase: 'https://editor.print.app/',
				runBase: 'https://run.print.app/',
				frameDomain: 'https://editor.print.app',
			};

			static SELECTORS = {
				mini: '#main > div.row > div:nth-child(1),.single-product-thumbnail,#content > div > div.col-sm-8 > ul.thumbnails,.main > .left',
				cartButton: '.single_add_to_cart_button,.kad_add_to_cart,.addtocart,#add-to-cart,.add_to_cart,#add,#AddToCart,#product-add-to-cart,#add_to_cart,#button-cart,#AddToCart-product-template,.product-details-wrapper .add-to-cart,.btn-addtocart,.ProductForm__AddToCart,.add_to_cart_product_page,#addToCart,[name="add"],[data-button-action="add-to-cart"],[data-action="add-to-cart"]',
				variation: '.product-variant-id',
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
			
			async init(params) {
				if (params.previews) {
					if (typeof params.previews === 'string') params.previews = JSON.parse(params.previews);
					this.model.session.previews = params.previews;
				}
				this.model.env = {
					isAdmin: false,
					customValues: {},
					parentWidth: window.innerWidth,
					parentHeight: window.innerHeight,
					mode: params.artworkId ? 'artwork' : 'new-project',
					...params,
				};

				this.initCook()

				if (!this.model.env.settings) {
					const 	designId = this.model.env.designId || this.model.env.designList?.[0]?.id,
							domainKey = this.model.env.domainKey;

					const response = await window.fetch(`${global.PrintAppClient.ENDPOINTS.runBase}${domainKey}/*/?designId=${designId}&required=settings&lang=${this.model.env?.langCode || this.model.langCode}`);
					if (response.ok) {
						const data = await response.json();
						({ settings: this.model.env.settings, language: this.model.env.language } = data || {});
					}
				}
				this.model.env.settings ??= {};
				this.model.env.language ??= {};

				if (params.settingsOverride)
					this.model.env.settings = { ...this.model.env.settings, ...params.settingsOverride };

				// this is needed should in case where the customer comes in with a pre-existing variation url and the app is auto-shown
				// we will always pass the current variation value on app show for situations where customer clicks button to launch editor.. which is most cases
				if (Object.keys(this.model.env.variants || {}).length &&
						typeof global.PrintAppClient.getSelectedVariant(this.model.env.settings?.customVariantSelector) !== 'undefined') {
							this.model.env.variant = global.PrintAppClient.getSelectedVariant(this.model.env.settings?.customVariantSelector);
				}
				
				this.model.state.mode = params.mode || 'new-project';
				if (this.model.env.noInstance) this.managePage();
				else if (this.model.env.renderUserProjects) this.renderUserProjects();
				else this.createUi();

				//	Product pages that also run Print Options: bind to the widget
				//	instead of the theme's markup. Resolves to nothing elsewhere.
				this.options = new global.PrintAppClient.OptionsBridge(this);
				this.options.start();
			}
			
			renderUserProjects() {}		// to be overridden in wordpress.js

			async createUi() {
				this.fire('ui:create');
				this.loadStyling();
						
				this.model.ui.frame = this.makeFrame();
				this.setMainDiv();
				this.handleDisplayMode();
				this.createCommandUI();
				this.model.ui.cartButton = global.PrintAppClient.queryPrioritySelector(this.model.env?.settings?.cartButtonSelector || global.PrintAppClient.SELECTORS.cartButton, true);
				this.model.act.uiCreated = true;
				this.runCustomScripts();
				this.fire('ui:created');
			}
			/**
			 * Which editor app the iframe loads: '' is the classic (fabric)
			 * editor at the CDN root, 'pfx/' the printfx editor deployed
			 * beside it. The tenant's `usePrintFxEditor` setting decides;
			 * an explicit `engine` param ('pfx' | 'classic') overrides it,
			 * so QA can force either without touching tenant settings.
			 *
			 * This routes by TENANT. Per-design correction is the editors'
			 * own job: pfx dispatches unmigrated fabric designs back to
			 * classic when the tenant is not flagged (engineDispatch), and
			 * classic holds printfx-owned designs read-only
			 * (engineGuardService). Both apps live on the same origin, so
			 * frameDomain and every postMessage path stay exactly as-is.
			 */
			editorPath() {
				const engine = this.model.env.engine;
				if (engine === 'pfx' || engine === 'printfx') return 'pfx/';
				if (engine === 'classic') return '';
				return this.model.env.settings?.usePrintFxEditor ? 'pfx/' : '';
			}
			makeFrame() {
				let frame = document.createElement('iframe');
				frame.src = `${global.PrintAppClient.ENDPOINTS.cdnBase}${this.editorPath()}index.html`;
				frame.title = 'Print.App';
				frame.classList.add('printapp-frame');
				return frame;
			}

			setMainDiv() {
				this.model.ui.base = document.querySelector(this.model.env.commandSelector || '#pa-buttons');
			}

			handleDisplayMode() {
				if (!this.model.env.settings.displayMode) this.model.env.settings.displayMode = 'modal';

				if (this.model.env.settings.displayMode === 'mini' && !(this.model.env.settings.miniSelector || global.PrintAppClient.SELECTORS.mini)) {
					this.model.env.settings.displayMode = 'modal';
				}
				
				var mounted = false;
				switch (this.model.env.settings.displayMode) {
					case 'mini':
						this.model.ui.frame.classList.remove('printapp-display-modal');
						this.model.ui.frame.classList.remove('printapp-display-inline');
						this.model.ui.frame.classList.add('printapp-display-mini');
						this.model.ui.frameParent = document.querySelector(this.model.env.settings.miniSelector || global.PrintAppClient.SELECTORS.mini);
						if (this.model.ui.frameParent) {
							this.model.ui.frameParent.innerHTML = '';
							this.model.ui.frameParent.appendChild(this.model.ui.frame);
							mounted = true;
						}
					break;
					case 'inline':
						this.model.ui.frame.classList.remove('printapp-display-modal');
						this.model.ui.frame.classList.remove('printapp-display-mini');
						this.model.ui.frame.classList.add('printapp-display-inline');
						this.model.ui.frameParent = document.querySelector(this.model.env.settings.inlineSelector || '[null]');
						this.model.ui.frameParent?.insertBefore?.(this.model.ui.frame, this.model.ui.frameParent.firstChild);
						mounted = true;
					break;
				}

				if (!mounted) {
					this.model.ui.displayMode = this.model.env.settings.displayMode = 'modal';
					document.body.appendChild(this.model.ui.frame);
					this.model.ui.frame.classList.add('printapp-display-modal');
					this.model.ui.frame.classList.remove('printapp-display-inline');
					this.model.ui.frame.classList.remove('printapp-display-mini');
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
				await global.PrintAppClient.loadTag(`https://editor.print.app/js/petite-vue.js`);

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
									<input :data-title="item.title" @input="inputEvt" @focus="focusEvt" class="input" :type="item.inputType" :name="item.id" :placeholder="item.placeholder || ''" v-model="item.value" />
								</div>
								<div v-if="item.type === 'number'">
									<label>{{item.title}}:</label>
									<input :data-title="item.title" @input="inputEvt" @focus="focusEvt" class="input" type="number" :name="item.id" :max="item.maxValue" :min="item.minValue" :type="item.inputType" :name="item.id" :placeholder="item.placeholder || ''" v-model="item.value" />
								</div>
								<div v-if="item.type === 'textarea'">
									<label>{{item.title}}:</label>
									<textarea :data-title="item.title" @input="inputEvt" @focus="focusEvt" :row="item.rows" :name="item.id" :placeholder="item.placeholder || ''" v-model="item.value"></textarea>
								</div>
								<div @change="changeEvt" v-if="item.type === 'select'">
									<label>{{item.title}}:</label>
									<select :data-title="item.title" :value="item.value" :name="item.id">
										<option v-for="option in item.options" v-model="option.value">{{option.title || option.value}}</option>
									</select>
								</div>
								<div @change="changeEvt" v-if="item.type === 'switch'" class="switch-div">
									<label :for="item.id">{{item.title}}</label>
									<label class="switch">
										<input :data-title="item.title" :name="item.id" v-model="item.value" type="checkbox" />
										<span class="slider"></span>
									</label>
								</div>
								<div @change="changeEvt" v-if="item.type === 'option'">
									<label>{{item.title}}:</label>
									<div v-for="option in item.options" class="option">
										<input :data-title="item.title" type="radio" :name="option.id" v-model="option.value" />
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
					focusEvt: this.controlFocus.bind(this),
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
			controlFocus(event) {
				let id = event?.target?.name,
					item = this.model.ui.vue.items.find(i => i.id === id);

				this.sendMsg('control:focus', { eventType: 'focus', data: item });
			}

			createControl(data) {
				if (!data?.type || !this.model.ui.vue) return;
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
			
			/**
			 * Stop the page scrolling behind the editor, remembering what to
			 * put back.
			 *
			 * Guarded: a second showApp without a close in between must NOT
			 * re-capture, or it stores the locked values as the "originals"
			 * and the page can never be unlocked again. That is reachable from
			 * a double click, or from two scripts both driving the app.
			 */
			lockScroll() {
				if (this.model.act.bodyStyles) return;
				this.model.act.bodyStyles = {
					overflow: document.body.style.overflow,
					position: document.body.style.position,
					html: document.documentElement.style.overflow
				};
			}

			/** Put the page back exactly as it was. Safe to call twice. */
			unlockScroll() {
				const saved = this.model.act.bodyStyles;
				if (!saved) return;
				document.body.style.overflow = saved.overflow;
				document.body.style.position = saved.position;
				document.documentElement.style.overflow = saved.html ?? '';
				this.model.act.bodyStyles = null;
			}

			showApp(event) {
				this.fire('app:before:show');
				this.lockScroll();

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
					variant: global.PrintAppClient.getSelectedVariant(this.model.env.settings?.customVariantSelector),
					designId: event?.designId,
				});
				this.setCommandPref();
				this.options?.onEditorOpened();

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
			destroyApp() {
				this.fire('app:before:destroy');
				//	Taking the iframe away is not the same as closing it: without
				//	these two the page keeps a scroll lock it can never shed, and
				//	the widget keeps listening to a client that no longer exists.
				this.unlockScroll();
				this.options?.dispose();
				this.model.ui.frame.remove();
				this.fire('app:after:destroy');
			}
			closeApp() {
				this.fire('app:before:close');

				this.model.ui.frame.classList.remove('printapp-shown');
				this.unlockScroll();
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

				//	Release the add-to-cart hold HERE, not in the app:closed
				//	handler: closeApp() and close() are public, and a caller who
				//	uses them directly would otherwise leave the widget's CTA
				//	disabled with no way to re-enable it.
				this.options?.onEditorClosed();

				this.fire('app:after:close');
			}
			saved(value) {
				this.model.session = value;
				this.model.state.mode = 'edit-project';
			}
			clearDesign() {
				this.model.state.mode = 'new-project';
				this.setCommandPref();
				this.options?.onDesignCleared();
				this.fire('app:project:reset', { projectId: this.model.session.projectId });
			}
			updatePreviews() {
				if (this.model?.env?.settings?.retainProductImages) return;
				if (!this.model?.env?.previewsSelector && !this.model?.env?.settings?.customPreviewSelector) return;

				var previews = this.model?.session?.previews || this.model.env.previews;
				if (typeof previews === 'string') previews = global.PrintAppClient.parse(previews);

				const previewBase = document.querySelector(this.model?.env?.settings?.customPreviewSelector || this.model.env.previewsSelector);
				if (!previewBase || !previews?.length) return;

				if (this.model?.state?.mode === 'edit-project')
					previews = previews.map(p => ({ ...p, url: `${p.url}&r=${Math.random()}` }));

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
				handler.postMessage(message, global.PrintAppClient.ENDPOINTS.frameDomain);
			}

			handleMsg (event) {
				if (event.origin !== global.PrintAppClient.ENDPOINTS.frameDomain) return;
				
				const message = global.PrintAppClient.parse(event.data);

				if (message) {
					switch (message.event) {
						case global.PrintAppClient.EDITOR_NAME:
							this.model.ui.messageSource = event.source;
							this.sendMsg(global.PrintAppClient.NAME, this.model.env);
						break;
						case 'app:ready':
							this.appReady();
							this.fire(message.event, message.data, true);
						break;
						case 'app:saved':
							this.model.state.saved = true;
							
							if (message.data && message.data.mode && !message.data.mode.includes('artwork'))
								message.data.mode = 'edit-project';

							this.saved(message.data);
							this.fire(message.event, message.data, true);
							this.closeApp();
							this.setCommandPref();
							this.updatePreviews();
							this.handleCartBtn();
							this.options?.onDesignSaved();
						break;
						case 'app:closed':
							this.model.state.closed = true;
							this.fire(message.event, message.data, true);
							this.closeApp();	//	releases the hold for us
							this.setCommandPref();
						break;
						case 'app:validation:success':
							this.model.settings = message.data.settings;
							this.fire(message.event, message.data, true);
							this.validationComplete()
						break;
						case 'app:validation:failed':
							this.unload(message.data);
							this.fire(message.event, message.data, true);
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
							this.fire(message.event, message.data, true);
						break;
					}
				}
			}

			updateElement(data) {
				if (!data?.selector) return;
				//	Print Options fields live in a shadow root and are owned by Vue:
				//	they take a value through the widget's API, never through the DOM.
				if (global.PrintAppClient.OptionsBridge.targets(data.selector))
					return this.options?.update(data);

				const element = document.querySelector(data.selector);
				if (!element) return;

				this.model.state._pauseDispatch = true;

				switch (element.tagName) {
					case 'SELECT':
						if (typeof data.selectedIndex !== 'undefined') {
							element.selectedIndex = data.selectedIndex;
						} else if (typeof data.value !== 'undefined') {
							element.value = data.value;
						}
						element.dispatchEvent(new window.Event('change', { bubbles: true }));
					break;
					case 'FIELDSET':
						let input;
						if (typeof data.selectedIndex !== 'undefined') {
							input = element.querySelectorAll('input')[data.selectedIndex];
						} else if (typeof data.value !== 'undefined') {
							input = element.querySelector(`input[value="${data.value}"]`);
						}
						if (input) {
							input.checked = true;
							input.dispatchEvent(new window.Event('change', { bubbles: true }));
						}
					break;
					case 'INPUT':
						element.value = data.value;
						element.dispatchEvent(new window.Event('input', { bubbles: true }));
						element.dispatchEvent(new window.Event('change', { bubbles: true }));
					break;
				}
				setTimeout(() => this.model.state._pauseDispatch = false, 100);
			}

			hookElement(data) {
				if (!data?.selector) return;
				//	Same reason as updateElement: the widget is subscribed to by
				//	event, not by walking the DOM for a select/input/fieldset.
				if (global.PrintAppClient.OptionsBridge.targets(data.selector))
					return this.options?.hook(data);

				let element;
				try {
					element = document.querySelector(data.selector);
				} catch (e) { console.error(e) }
				if (!element) return;

				const elementValues = target => {
					switch (target.tagName) {
						case 'SELECT':
							return {
								value: target.value,
								text: target.options[target.selectedIndex]?.text,
								values: [...target.options].map(o => ({ value: o.value, text: o.text, title: o.text, selected: o.selected })),
								selectedIndex: target.selectedIndex,
								type: target.tagName,
							};
						case 'INPUT':
							return {
								value: target.value,
								checked: target.checked,
								type: target.tagName,
							};
						case 'FIELDSET':
							return {
								value: target.querySelector('input:checked').value,
								values: [...target.querySelectorAll('input')].map(i => ({ value: i.value, selected: i.checked })),
								selectedIndex: [...target.querySelectorAll('input')].findIndex(i => i.checked),
								type: target.tagName,
							};
					}
					return {};
				};

				// send the initial value...
				this.sendMsg(data.callbackEvent, {
					selector: data.selector,
					...elementValues(element),
					event: 'init',
					callbackData: data.callbackData,
				})

				// then add the event listener...
				const eventType = (element.tagName === 'BUTTON') ? 'click' : 'change'; 
				element.addEventListener(eventType, evt => {
					if (this.model.state._pauseDispatch) return;

					this.sendMsg(data.callbackEvent, {
						selector: data.selector,
						...elementValues(evt.target),
						event: eventType,
						callbackData: data.callbackData,
					})
				})
			}

			unload(data) {
				if (this.model.ui.base) {
					this.model.ui.base.innerHTML = typeof data === 'string' ? data : '';
				}
				//	Same as destroyApp: the frame is going, so the page must get
				//	its scrolling back and the widget must stop listening to us.
				this.unlockScroll();
				this.options?.dispose();
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
				this.sendMsg('events:listen', { type });
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

			fire (type, data, fromFrame) {
				let handlers = this.handlers[type], i, len, invoked,
					event = { type, data };
				if (handlers instanceof Array) {
					handlers = handlers.concat();
					for (i = 0, len = handlers.length; i < len; i++) {
						handlers[i].call(this, event);
						invoked = true;
					}
				}
				if (!invoked && !fromFrame) this.sendMsg(type, data);
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

			initCook() {
				if (this.model.env?.cookieKey) {
					const check = document.cookie.match(new RegExp('(^| )' + this.model.env.cookieKey + '=([^;]+)'));
					if (!check) {
						const value = Math.random().toString(36).substring(2, 15) + '.' + Math.random().toString(36).substring(2, 15);
						const age = 60 * 60 * 24 * 30;
						document.cookie = `${this.model.env.cookieKey}=${value}; path=/; max-age=${age}; SameSite=Lax`;
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
				if (url.indexOf('https://') !== 0) url = `${global.PrintAppClient.ENDPOINTS.apiBase}${url}`;
				
				const   headers = new window.Headers();
				if (cType) headers.append('Content-Type', cType);
				
				window.fetch(url, { method: method, headers: headers, body: formData })
					.then(d => {
						return d ? global.PrintAppClient.parse(d) : d;
					}).then(response => {
						if (response?.statusCode > 299) return response.message;
						if (typeof response?.sessToken !== 'undefined') {
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

			static getSelectedVariant(custom) {
				let variation = document.querySelector(custom || global.PrintAppClient.SELECTORS.variation);
				if (variation) return variation.value;
				const 	search = window.location.search,
						regex = /[?&](variation|variant)=([^&]*)/i;
				let match = search.match(regex);
				return match ? match[2] : undefined;
			}

			static queryPrioritySelector(selectors, visible) {
				const list = (typeof selectors === 'string') ? selectors.split(',') : selectors;
				let firstAvailable = null; // Store the first available element if no visible elements are found
				for (let selector of list) {
					const elements = document.querySelectorAll(selector);
					for (let element of elements) {
						// Check if the element is in the document flow
						if (element?.offsetParent) {
							// If we're not specifically looking for a visible element, return the first one found
							if (!visible) return element;
			
							// Check if the element is "visible" by checking its dimensions
							if (element?.offsetWidth > 0 && element?.offsetHeight > 0) {
								return element; // Return the first element that is visible
							}
			
							// Keep the first encountered element in case no visible elements are found
							if (!firstAvailable) firstAvailable = element;
						}
					}
				}
				// Return the first available element if no visible element was found
				return firstAvailable;
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
				tag.href = `${global.PrintAppClient.ENDPOINTS.cdnBase}css/style.css`;
				document?.head?.appendChild?.(tag);
			}
		}

		/* ------------------------------------------------------------------ */
		/* Print Options bridge                                                */
		/* ------------------------------------------------------------------ */

		/**
		 * Talks to the <print-configurator> widget when one is on the product
		 * page (docs/printapp-integration-v1.md in the product-options repo).
		 *
		 * The widget renders into a SHADOW ROOT, so the selector transport
		 * this client uses for themes cannot reach it: querySelector cannot
		 * see inside, there are no select/input/fieldset elements to find,
		 * and setting .value would not move Vue's state anyway. It exposes a
		 * versioned API on the element instead, and this class is the only
		 * place that speaks it.
		 *
		 * Everything degrades to nothing: no widget on the page means no
		 * bridge, and every existing selector-based connector keeps working
		 * exactly as before.
		 */
		global.PrintAppClient.OptionsBridge = class {
			static ELEMENT = 'print-configurator';
			/** Echo tag AND producer id AND the file record's `source`. */
			static SOURCE = 'printapp';
			static PREFIX = 'po:';
			/** Field types that are their own role (see the widget's field()). */
			static IMPLICIT_ROLES = ['quantity', 'dimensions', 'file'];
			/**
			 * Every unit the editor can report, in millimetres.
			 *
			 * `cUnit` is the design's own unit and falls back to "px", so px is
			 * not an edge case — it is the default for a design that never set
			 * one. px and pt assume the editor's configured 96 dpi.
			 */
			static UNITS_IN_MM = { mm: 1, cm: 10, in: 25.4, ft: 304.8, pt: 25.4 / 72, px: 25.4 / 96 };
			/** How long to wait for a widget that renders after we boot. */
			static DISCOVERY_MS = 10000;

			el = null;
			ready = false;
			/** connectorId -> { selector, target, callbackEvent, callbackData } */
			bound = new Map();
			/** Registrations that arrived before the widget was ready. */
			pending = [];
			/** Kept so dispose() can take them off the widget again. */
			listeners = [];

			constructor(client) {
				this.client = client;
			}

			get lang() {
				return this.client?.model?.env?.language || {};
			}

			/** This product has a design to offer — otherwise: no button. */
			get hasDesign() {
				const env = this.client?.model?.env || {};
				return Boolean(env.designId || env.designList?.length);
			}

			async start() {
				if (!window.customElements) return false;
				const el = await this.find();
				if (!el) return false;

				this.el = el;
				try {
					await window.customElements.whenDefined(global.PrintAppClient.OptionsBridge.ELEMENT);
				} catch (e) { return false; }

				//	`state` is non-null once the blueprint is parsed; before that we
				//	must wait for `ready` or every read comes back empty.
				if (el.state) this.onReady();
				else el.addEventListener('ready', () => this.onReady(), { once: true });
				return true;
			}

			/**
			 * The widget's own script may add the element after ours runs, so a
			 * single querySelector is not enough — watch briefly, then give up.
			 */
			find() {
				const name = global.PrintAppClient.OptionsBridge.ELEMENT;
				return new Promise(resolve => {
					const hit = () => document.querySelector(name);
					if (hit()) return resolve(hit());
					if (!window.MutationObserver) return resolve(null);

					const observer = new window.MutationObserver(() => {
						const found = hit();
						if (!found) return;
						observer.disconnect();
						clearTimeout(timer);
						resolve(found);
					});
					observer.observe(document.documentElement, { childList: true, subtree: true });
					const timer = setTimeout(() => {
						observer.disconnect();
						resolve(null);
					}, global.PrintAppClient.OptionsBridge.DISCOVERY_MS);
				});
			}

			onReady() {
				if (this.ready) return;
				this.ready = true;
				const Bridge = global.PrintAppClient.OptionsBridge;

				if (this.hasDesign && typeof this.el.registerProducer === 'function') {
					this.el.registerProducer(Bridge.SOURCE, {
						label: this.lang.customize || 'Personalise Design',
						description: this.lang.customize_hint || undefined
					});
					//	The widget only reports the customer's intent — opening the
					//	editor is ours to do.
					this.listen('producer', event => {
						if (event?.detail?.producer === Bridge.SOURCE) this.client.showApp();
					});
				}

				//	One listener for every inbound connector: the widget emits a
				//	single `change` per state transition, tagged with its cause.
				this.listen('change', event => this.onWidgetChange(event));

				//	A design restored from the session (returning customer, or a
				//	cart edit) must price correctly before anyone touches anything.
				if (this.client?.model?.state?.mode === 'edit-project') this.publishDesign();

				this.applyForceCustomization();

				const queued = this.pending.splice(0);
				queued.forEach(data => this.hook(data));
			}

			/** Subscribe to the widget, remembering how to unsubscribe. */
			listen(type, handler) {
				this.el.addEventListener(type, handler);
				this.listeners.push([type, handler]);
			}

			/**
			 * Let go of the widget completely.
			 *
			 * A destroyed client that is still listening is not harmless: it
			 * would re-open its own editor on the next `producer` click, and
			 * each of those opens grabs the page's scroll lock. One page that
			 * swaps products — a demo, a quick-view modal, a SPA storefront —
			 * accumulates one such ghost per swap.
			 */
			dispose() {
				for (const [type, handler] of this.listeners) {
					this.el?.removeEventListener(type, handler);
				}
				this.listeners = [];
				this.release();
				this.el?.unregisterProducer?.(global.PrintAppClient.OptionsBridge.SOURCE);
				this.bound.clear();
				this.pending = [];
				this.ready = false;
				this.el = null;
			}

			/* -------------------------------------------------------------- */
			/* Artwork slot                                                    */
			/* -------------------------------------------------------------- */

			/**
			 * Hand the finished design to the widget's artwork slot — the same
			 * slot an uploaded print file fills, because a job has one artwork
			 * and the customer either uploads or designs.
			 *
			 * This is the whole pricing integration: page count and canvas feed
			 * per-page and per-area rules with no arithmetic on our side.
			 */
			publishDesign() {
				if (!this.el || typeof this.el.setFile !== 'function') return;
				const Bridge = global.PrintAppClient.OptionsBridge;
				const session = this.client?.model?.session || {};
				const fileId = session.projectId || session.designId;
				if (!fileId) return;

				const record = {
					fileId,
					source: Bridge.SOURCE,
					fileName: this.lang.your_design || 'Your design'
				};

				//	One preview per page, so the preview count IS the page count.
				//	(Artwork mode reports it outright.)
				const pages = session.pageCount ?? session.previews?.length;
				if (Number.isFinite(pages) && pages > 0) record.pages = pages;

				//	Canvas size only exists here when a width/height connector has
				//	streamed it to us; the save payload does not carry one.
				if (this.canvas?.w && this.canvas?.h) {
					record.canvas = { w: this.canvas.w, h: this.canvas.h, unit: this.canvas.unit || 'mm' };
				}

				//	Provider extras live under `raw` — unknown top-level keys are
				//	stripped by the widget's FileMetadata contract.
				const previewUrl = session.previews?.[0]?.url;
				if (previewUrl) record.raw = { previewUrl, projectId: session.projectId };

				this.el.setFile(record, { source: Bridge.SOURCE });
			}

			clearDesign() {
				if (typeof this.el?.setFile !== 'function') return;
				this.el.setFile(null, { source: global.PrintAppClient.OptionsBridge.SOURCE });
			}

			hold(message) {
				const Bridge = global.PrintAppClient.OptionsBridge;
				this.el?.addHold?.(Bridge.SOURCE, { message, source: Bridge.SOURCE });
			}

			release() {
				const Bridge = global.PrintAppClient.OptionsBridge;
				this.el?.releaseHold?.(Bridge.SOURCE, { source: Bridge.SOURCE });
			}

			/**
			 * forceCustomization, expressed as a hold instead of hiding a button.
			 *
			 * The widget owns add-to-cart wherever it renders, and its own loader
			 * has already hidden the theme's button — so the DOM trick in
			 * handleCartBtn has nothing left to hide. A named hold gates the real
			 * CTA and composes with anyone else's (Filecheck's, say).
			 */
			applyForceCustomization() {
				if (!this.ready || !this.client?.model?.env?.settings?.forceCustomization) return;
				if (!this.hasDesign) return;

				if (this.client.model.state.mode === 'new-project') {
					this.hold(this.lang.customize_required || this.lang.customize || 'Personalise your design to continue');
				} else {
					this.release();
				}
			}

			/* Lifecycle hooks, called by the client ------------------------- */

			onEditorOpened() {
				if (!this.ready) return;
				this.hold(this.lang.finish_design || 'Finish your design');
			}

			onDesignSaved() {
				if (!this.ready) return;
				this.publishDesign();
				this.release();
				this.applyForceCustomization();
			}

			onEditorClosed() {
				if (!this.ready) return;
				this.release();
				//	Closing without saving leaves forceCustomization to re-assert.
				this.applyForceCustomization();
			}

			onDesignCleared() {
				if (!this.ready) return;
				this.clearDesign();
				this.applyForceCustomization();
			}

			/* -------------------------------------------------------------- */
			/* Connectors                                                      */
			/* -------------------------------------------------------------- */

			/** Does this connector target the widget rather than the theme? */
			static targets(selector) {
				return typeof selector === 'string' &&
						selector.indexOf(global.PrintAppClient.OptionsBridge.PREFIX) === 0;
			}

			/**
			 * Parse a widget target.
			 *
			 *   po:role/size        the field the merchant means by "size"
			 *   po:field/stock_id   an exact field id
			 *   po:quantity         shorthand (quantity | dimensions | file)
			 *   po:dimensions.w     one component of a dimensions field
			 *
			 * Roles exist because merchants name fields freely; addressing by
			 * role is what makes one connector work across every store.
			 */
			parse(selector) {
				const Bridge = global.PrintAppClient.OptionsBridge;
				let raw = selector.slice(Bridge.PREFIX.length),
					axis = null;

				const dot = raw.lastIndexOf('.');
				if (dot > -1 && ['w', 'h'].includes(raw.slice(dot + 1))) {
					axis = raw.slice(dot + 1);
					raw = raw.slice(0, dot);
				}

				const slash = raw.indexOf('/');
				return {
					kind: slash < 0 ? '' : raw.slice(0, slash),
					key: slash < 0 ? raw : raw.slice(slash + 1),
					axis
				};
			}

			fields() {
				const schema = this.el?.schema;
				if (!schema?.sections) return [];
				return schema.sections.reduce((all, section) => all.concat(section.fields || []), []);
			}

			resolve(selector) {
				const Bridge = global.PrintAppClient.OptionsBridge;
				const { kind, key, axis } = this.parse(selector);
				const list = this.fields();
				let field = null;

				if (kind === 'field') {
					field = list.find(f => f.id === key) || null;
				} else if (kind === 'role') {
					//	Role only — never fall through to an id, or a merchant who
					//	happens to name a field "size" silently steals the binding.
					field = list.find(f => f.role === key) ||
							list.find(f => Bridge.IMPLICIT_ROLES.includes(key) && f.type === key) ||
							null;
				} else {
					field = this.el?.field?.(key) || null;
				}
				return field ? { field, axis } : null;
			}

			/* Reading ------------------------------------------------------- */

			/** The widget's answer for a field, in the envelope the editor expects. */
			read(field, axis) {
				const value = this.el?.state?.selections?.[field.id];

				if (field.type === 'dimensions') {
					const dims = value && typeof value === 'object' ? value : {};
					return {
						value: axis ? dims[axis] : dims,
						unit: dims.unit,
						type: field.type
					};
				}

				if (Array.isArray(field.options)) {
					const selected = Array.isArray(value) ? value : [value];
					const index = field.options.findIndex(option => option.id === selected[0]);
					return {
						value: Array.isArray(value) ? value.join(',') : (value ?? ''),
						text: field.options[index]?.label,
						values: field.options.map(option => ({
							value: option.id,
							text: option.label,
							title: option.label,
							selected: selected.includes(option.id)
						})),
						selectedIndex: index,
						type: field.type
					};
				}

				return { value: value ?? '', type: field.type };
			}

			/**
			 * Register a connector against the widget. Called from hookElement,
			 * and queued if the blueprint has not finished loading.
			 */
			hook(data) {
				if (!this.ready) {
					this.pending.push(data);
					return;
				}
				const found = this.resolve(data.selector);
				if (!found) return;	//	merchant removed the field: stay quiet

				const id = data.callbackData?.connectorId || data.selector;
				this.bound.set(id, {
					selector: data.selector,
					fieldId: found.field.id,
					axis: found.axis,
					callbackEvent: data.callbackEvent,
					callbackData: data.callbackData
				});
				this.send(this.bound.get(id), 'init');
			}

			send(entry, eventType) {
				const found = this.resolve(entry.selector);
				if (!found) return;
				this.client.sendMsg(entry.callbackEvent, {
					selector: entry.selector,
					...this.read(found.field, entry.axis),
					event: eventType,
					callbackData: entry.callbackData
				});
			}

			/**
			 * One widget event, fanned out to whichever connectors care.
			 *
			 * Echo suppression is exact here: the widget tags every event with
			 * the source of the write that caused it, so our own writes are
			 * identifiable without the timing guard the DOM path needs.
			 */
			onWidgetChange(event) {
				const detail = event?.detail;
				if (!detail || detail.source === global.PrintAppClient.OptionsBridge.SOURCE) return;

				const changed = detail.changed || [];
				this.bound.forEach(entry => {
					if (!changed.includes(`selections.${entry.fieldId}`)) return;
					this.send(entry, 'change');
				});
			}

			/* Writing ------------------------------------------------------- */

			static convert(value, from, to) {
				const table = global.PrintAppClient.OptionsBridge.UNITS_IN_MM;
				if (!from || !to || from === to || !table[from] || !table[to]) return value;
				return Math.round((value * table[from] / table[to]) * 100) / 100;
			}

			/**
			 * The editor changed something; put it into the widget as if the
			 * customer had chosen it — same validation, same repricing path.
			 */
			update(data) {
				if (!this.ready || typeof this.el?.setSelection !== 'function') return;
				const Bridge = global.PrintAppClient.OptionsBridge;
				const found = this.resolve(data.selector);
				if (!found) return;

				const { field, axis } = found;
				const write = value => this.el.setSelection(field.id, value, { source: Bridge.SOURCE });

				switch (field.type) {
					case 'dimensions': {
						const number = Number(data.value);
						if (!Number.isFinite(number)) return;
						const current = this.el.state?.selections?.[field.id] || {};
						//	The editor speaks its own display unit. When it says so we
						//	convert; when it does not, the value belongs to whatever
						//	unit the customer is currently looking at.
						const unit = current.unit || field.defaultUnit || 'mm';
						const next = data.unit ? Bridge.convert(number, data.unit, unit) : number;
						if (!axis) return;
						write({ w: axis === 'w' ? next : current.w, h: axis === 'h' ? next : current.h, unit });
						return;
					}
					case 'quantity':
					case 'number': {
						const number = Number(data.value);
						if (Number.isFinite(number)) write(number);
						return;
					}
					case 'text':
						write(String(data.value ?? ''));
						return;
					case 'select-many': {
						const list = Array.isArray(data.value)
							? data.value
							: String(data.value ?? '').split(',').map(v => v.trim()).filter(Boolean);
						write(list.map(v => this.choiceId(field, v)).filter(Boolean));
						return;
					}
					case 'select-one': {
						const id = this.choiceId(field, data.value);
						if (id) write(id);
						return;
					}
					default:
						//	file fields are answered by producers, never written to.
						return;
				}
			}

			/** Accept a choice id or its visible label — merchants map by both. */
			choiceId(field, value) {
				const wanted = String(value ?? '').trim();
				if (!wanted) return null;
				const options = field.options || [];
				const byId = options.find(option => option.id === wanted);
				if (byId) return byId.id;
				const lower = wanted.toLowerCase();
				return options.find(option => String(option.label ?? '').toLowerCase() === lower)?.id ?? null;
			}
		};
	}

})(typeof window !== 'undefined' ? window : global);