// Dependencies: PrintAppClient

if (typeof this.PrintAppShopify === 'undefined') {
    
    this.PrintAppShopify = class {
        static NAME = 'print-app-shopify';
        static VERSION = '0.1';
        static STORAGEKEY = 'print-app-sp';
        static PROJECTSKEY = 'print-app-sp-projects';
        static ENDPOINTS = {
            baseCdn: 'https://editor.print.app/',
            runCdn: 'https://run.print.app/',
            pdf: 'https://pdf.print.app/',
        };

        static SELECTORS = {
            previews: '.product__media-wrapper,.image,#product-photo-container,.product-left-column,.main-image,.product-photo-container,.featured,#image-block,.product-single-photos,.product_slider,#product-image,.photos,.product-single__photos,.image__container,.product-gallery',
            cartForm: '[data-type="add-to-cart-form"],[action="/cart/add"],[action="/cart/add.js"],#add-item-form,#add-to-cart-form,[action$="/cart/add"], #AddToCartForm',
        };
        model = { };

        constructor(params) {
            if (!params) return console.error(`Parameters required but "undefined" was passed`); 
            this.init(params);
        }
        
        async init(params) {
            this.model = { ...params };

            if (!this.model.hostname) return console.error('This script needs to be loaded via wire');

            if (this.model.accountPage) return this.doClientAccount();
            if (this.model.cartPage) return await this.setCartImages();

            this.model.langCode = document.querySelector('html').getAttribute('lang') || 'en';
            let metaLangTag = document.querySelector('[name="language-code"]');
            if (metaLangTag) this.model.langCode = metaLangTag.getAttribute('content') || this.model.langCode;

            await this.getUser();
            window.addEventListener('DOMContentLoaded', () => this.check());
            this.check();
        }

        async check() {
            if (window.printappset) return;
            window.printappset = true;
            const paButtons = `<div id="pa-buttons"><img src="${window.PrintAppShopify.ENDPOINTS.baseCdn}assets/images/loader.svg" style="width:2rem"></div>`;

            const liquidForm = document.getElementById('print-app-shopify-mount');
            if (liquidForm?.dataset?.productId) {
                this.model.productId = liquidForm.dataset.productId;
                this.model.cartForm = liquidForm.closest('form') || 
                                        window.PrintAppShopify.queryPrioritySelector(window.PrintAppShopify.SELECTORS.cartForm, true);
                
                if (!this.model.cartForm || !this.model.productId) return;
                liquidForm.insertAdjacentHTML('afterbegin', paButtons);

            } else {
                this.model.cartForm = window.PrintAppShopify.queryPrioritySelector(window.PrintAppShopify.SELECTORS.cartForm, true);
                const productId = this.model.cartForm?.querySelector('input[name="product-id"]')?.value;
                if (productId) this.model.productId = productId;
                if (!this.model.cartForm || !this.model.productId) return;
                this.model.cartForm.insertAdjacentHTML('afterbegin', paButtons);

            }
            
            const paData = await fetch(`${window.PrintAppShopify.ENDPOINTS.runCdn}dom_sp_${this.model.storeId}/${this.model.productId}/sp?lang=${this.model.langCode}`)
                                .then(d => d.json()).catch(console.error);

            if (!paData) {
                document.getElementById('pa-buttons')?.remove();
                return;
            }

            if (!paData.designs?.length && !paData.artwork && !Object.keys(paData.variants || {}).length) {
                const sec = document.getElementById('pa-buttons');
                return sec?.remove?.();
            }
            this.model.designData = paData;
            this.mountClient();
        }

        async mountClient() {
            await window.PrintAppShopify.loadTag(`${window.PrintAppShopify.ENDPOINTS.baseCdn}js/client.js`);

            if (this.model.clientMounted || typeof PrintAppClient !== 'function') return;

            let titleTag = document.querySelector('[property="og:title"]');
            if (titleTag) this.model.title = titleTag.getAttribute('content');
            
            let store = window.PrintAppShopify.getStorage(window.PrintAppShopify.STORAGEKEY);
            let currentValue = store[this.model.productId] || {};
            if (!document.getElementById('_printapp')) {
                this.model.cartForm.insertAdjacentHTML('afterbegin', `
                    <input id="_printapp" name="properties[_printapp]" type="hidden" value="">
                    <input id="_printapp-pdf-download" name="properties[_printapp-pdf-download]" type="hidden" value="">
                `);
                this.setElementValue(currentValue.projectId || '');
            }

            let designList = this.model.designData?.designs || [];
            if (Object.keys(this.model.designData?.variants || {}).length) {
                designList = designList.concat(Object.values(this.model.designData.variants).flat())
            }

            this.model.instance = window.printAppInstance = new PrintAppClient({
                langCode: this.model.langCode,
                product: {
                    id: this.model.productId,
                    name: window.__st?.pageurl?.split('/').pop().split('-').join(' '),
                    title: this.model.title,
                    url: window.location.href
                },
                framework: 'sp',
                domainKey: `dom_sp_${this.model.storeId}`,
                storeId: this.model.storeId,
                designList,
                variants: this.model.designData?.variants,
                artwork: this.model.designData?.artwork,
                settings: this.model.designData?.settings,
                language: this.model.designData?.language,
                projectId: currentValue.projectId,
                previews: currentValue.previews,
                mode: currentValue.projectId ? 'edit-project' : 'new-project',
                commandSelector: '#pa-buttons',
                previewsSelector: window.PrintAppShopify.SELECTORS.previews,
            });
            
            this.model.clientMounted = true;
            this.model.instance.on('app:saved', data => this.projectSaved(data));
            this.model.instance.on('app:project:reset', data => this.clearProject(data));

            setTimeout(() => {
                if (currentValue.projectId) this.setAddToCartAction();
            }, 1e3);

            if (this.model.designData?.settings?.observeFormRerenders) {
                this.observeFormRerenders();
            }

            // document.addEventListener('shopify:item-added', () => {
            //     console.log('Shopify Add to Cart detected, clearing project');
            //     this.clearProject({ projectId: this.model.currentProjectId });
            // });
            // window.PrintAppShopify.trackAddToCart();

            window.PrintAppShopify.initCustomModifications();
        }

        // Some themes / variant calculators re-render the cart form on variant change,
        // which removes #pa-buttons and our hidden inputs. Watch for that and restore them.
        // Opt-in via designData.settings.observeFormRerenders to avoid impacting stores
        // that don't need it.
        observeFormRerenders() {
            if (this._formObserver) return;

            // Resolve the scoped root: prefer the liquid mount's form parent, else the cart form's parent.
            // Walk up one extra level if the immediate parent looks like just the form wrapper, to
            // survive themes that replace the wrapper too.
            const resolveRoot = () => {
                const liquidForm = document.getElementById('print-app-shopify-mount');
                const form = (liquidForm?.dataset?.productId && liquidForm.closest('form'))
                    || this.model.cartForm
                    || window.PrintAppShopify.queryPrioritySelector(window.PrintAppShopify.SELECTORS.cartForm, true);
                if (!form) return null;
                // Use the grandparent when possible — gives one level of safety if the immediate
                // wrapper gets swapped. Falls back to parent, then form itself.
                return  form.parentElement?.parentElement?.parentElement ||
                        form.parentElement?.parentElement ||
                        form.parentElement || form;
            };

            const attach = () => {
                const root = resolveRoot();
                if (!root) return false;
                if (this._formObserver) this._formObserver.disconnect();
                this._observeRoot = root;
                this._formObserver = new MutationObserver(mutations => {
                    for (const m of mutations) {
                        if (m.addedNodes.length || m.removedNodes.length) {
                            schedule();
                            return;
                        }
                    }
                });
                this._formObserver.observe(root, { childList: true, subtree: true });
                return true;
            };

            const restore = () => {
                // Already present — nothing to do (also breaks the self-trigger loop).
                if (document.getElementById('pa-buttons')) return;

                // Prefer the liquid mount point if the store uses it; otherwise re-locate
                // a cart form via the same priority selector used at first mount.
                const liquidForm = document.getElementById('print-app-shopify-mount');
                let target, newForm;
                if (liquidForm?.dataset?.productId) {
                    newForm = liquidForm.closest('form')
                        || window.PrintAppShopify.queryPrioritySelector(window.PrintAppShopify.SELECTORS.cartForm, true);
                    target = liquidForm;
                } else {
                    newForm = window.PrintAppShopify.queryPrioritySelector(window.PrintAppShopify.SELECTORS.cartForm, true);
                    target = newForm;
                }
                if (!newForm || !target) return;

                this.model.cartForm = newForm;

                // Re-inject the buttons mount point.
                target.insertAdjacentHTML('afterbegin', `<div id="pa-buttons"></div>`);

                // Re-inject the hidden inputs that carry the project id into the cart.
                if (!document.getElementById('_printapp')) {
                    newForm.insertAdjacentHTML('afterbegin', `
                        <input id="_printapp" name="properties[_printapp]" type="hidden" value="">
                        <input id="_printapp-pdf-download" name="properties[_printapp-pdf-download]" type="hidden" value="">
                    `);
                    const store = window.PrintAppShopify.getStorage(window.PrintAppShopify.STORAGEKEY);
                    this.setElementValue(store[this.model.productId]?.projectId || '');
                }

                // Re-mount the petite-vue command UI into the new #pa-buttons node.
                const instance = this.model.instance;
                if (instance?.createCommandUI) {
                    instance.model.ui.base = document.getElementById('pa-buttons');
                    // Re-resolve the cart button since it likely got replaced too.
                    // Only use the configured/default selectors — no aggressive fallback.
                    const cartSelector = instance.model.env?.settings?.cartButtonSelector
                        || (window.PrintAppClient && window.PrintAppClient.SELECTORS?.cartButton);
                    if (cartSelector) {
                        instance.model.ui.cartButton = window.PrintAppShopify.queryPrioritySelector(cartSelector, true);
                    }
                    instance.createCommandUI();
                    // Re-attach the clear-on-add handler against the new cart button.
                    setTimeout(() => {
                        const stored = window.PrintAppShopify.getStorage(window.PrintAppShopify.STORAGEKEY)[this.model.productId]?.projectId;
                        if (this.model.currentProjectId || stored) this.setAddToCartAction();
                    }, 0);
                }

                // The form's ancestor we were observing may itself have been replaced —
                // re-attach to the freshly resolved root so future re-renders are caught.
                const currentRoot = resolveRoot();
                if (currentRoot && currentRoot !== this._observeRoot) attach();
            };

            // Debounce so a burst of mutations triggers one restore.
            let scheduled = false;
            const schedule = () => {
                if (scheduled) return;
                scheduled = true;
                requestAnimationFrame(() => {
                    scheduled = false;
                    try { restore(); } catch (e) { console.error(e); }
                });
            };

            attach();
        }

        clearProject(value) {
            const   { projectId } = value;
            const   store = window.PrintAppShopify.getStorage(window.PrintAppShopify.STORAGEKEY),
                    projects = window.PrintAppShopify.getStorage(window.PrintAppShopify.PROJECTSKEY);

            delete store[this.model.productId];
            delete projects[projectId || this.model.currentProjectId];
            
            window.localStorage.setItem(window.PrintAppShopify.STORAGEKEY, JSON.stringify(store));
            window.localStorage.setItem(window.PrintAppShopify.PROJECTSKEY, JSON.stringify(projects));
            
            this.setElementValue('');
            setTimeout(() => {
                window.location.reload();
            }, 3e3);
        }
        projectSaved(value) {
            const { data } = value;
            this.model.currentProjectId = data.projectId;
            
            const   store = window.PrintAppShopify.getStorage(window.PrintAppShopify.STORAGEKEY),
                    projects = window.PrintAppShopify.getStorage(window.PrintAppShopify.PROJECTSKEY);
                
            
            this.setElementValue(data.projectId);
            store[this.model.productId] = data;
            projects[data.projectId || this.model.currentProjectId] = data;

            window.localStorage.setItem(window.PrintAppShopify.STORAGEKEY, JSON.stringify(store));
            window.localStorage.setItem(window.PrintAppShopify.PROJECTSKEY, JSON.stringify(projects));

            this.setAddToCartAction();
        }
        setElementValue(value) {
            const   element = document.getElementById(`_printapp`),
                    pdfElement = document.getElementById(`_printapp-pdf-download`);

            if (element) element.value = value;
            if (pdfElement) pdfElement.value = value ? `${window.PrintAppShopify.ENDPOINTS.pdf}${value}` : '';
        }
        setAddToCartAction() {
			if (!this.model.instance || (this.model.instance?.model?.env?.settings?.displayMode === 'mini')) return;
            const   paInstance = this.model.instance,
                    cartButton = paInstance?.model?.ui?.cartButton;
            if (!cartButton) return;

            if (this._clearHandler) cartButton.removeEventListener('click', this._clearHandler);
            this._clearHandler = () => this.clearProject({ projectId: this.model.currentProjectId });
            cartButton.addEventListener('click', this._clearHandler);
	    }

        doClientAccount() { }

        static initCustomModifications() {
            
            // Shoify BSS plugin fix...
            window.bssFixSupportUpdateFormatBody = function (store, requestBody) {
                if (!store || !requestBody?.items?.length) return requestBody;
                const   element = document.getElementById(`_printapp`),
                        pdfElement = document.getElementById(`_printapp-pdf-download`);

                if (element?.value && pdfElement?.value) {
                    requestBody.items[0].properties = {
                        ...requestBody.items[0].properties,
                        _printapp: element.value,
                        _printapp_pdf_download: pdfElement.value,
                    };

                    // window?.printAppPrintShopifyInstance?.projectSaved?.({ data: { clear: true }})
                }
                return requestBody;
            }
        }
        
        static getStorage(key) {
            let r = window.localStorage.getItem(key);
            if (typeof r === 'string') return window.PrintAppShopify.parse(r);
            return r || {};
        }

        async setCartImages() {
            const data = await fetch('/cart.js')
                        .then(d => d.json()).catch(console.log);
            if (!data?.items) return;

            var string,
                imageSelector = '.line-item__image-wrapper > .aspect-ratio, .cart-line-image,.product_image,.cart_image,.product-image,.cpro_item_inner,.cart__image,.cart-image,.cart-item .image,.cart-item__image-container,.cart_page_image,.tt-cart__product_image,.CartItem__ImageWrapper,div.description.cf > a,.product-img, .cart-item-wrapper>.cart-item-block-left .cart-item-image img, .order-summary__body>tr>td>.line-item>.line-item__media-wrapper, .image-wrap>image-element>.image-element, .cart-item__media',
                images = document.querySelectorAll(imageSelector);
            
            data.items.forEach((item, index) => {
                if (item?.properties?.['_printapp']) {
                    const projectId = item.properties['_printapp'];
                    if (!/^[a-zA-Z0-9_-]+$/.test(projectId)) return;

                    const url = `${window.PrintAppShopify.ENDPOINTS.runCdn}preview/${encodeURIComponent(projectId)}`;
                    const div = document.createElement('div');
                    const newImg = document.createElement('img');
                    newImg.src = url;
                    newImg.width = 94;
                    newImg.style.cssText = 'margin: 5px; opacity: 1';
                    div.appendChild(newImg);
                    div.appendChild(document.createElement('br'));

                    let img = images[index];
                    if (img) {
                        const target = img.tagName === 'IMG' ? img.parentNode : img;
                        target.textContent = '';
                        target.appendChild(div);
                    }
                }
            });
        }

        static async loadTag(url) {
            if (document.querySelector(`script[src="${url}"]`) || document.querySelector(`link[href="${url}"]`)) return;
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
                tag.onerror = resolve;
            });
        }
        async getUser() {
            // TODO.. get user data details
            this.model.userData = {
                id: window.__st.cid,
            };
        }

        static parse(string) {
            if (!string) return;
            try {
                return JSON.parse(string);
            } catch (e) { console.error(e) }
        }

        static trackAddToCart() {
            // Use Symbols to avoid collisions and support idempotency
            const SYM = {
                patchedFetch: Symbol.for('shopifyCartWatcher.patchedFetch'),
                patchedXHR: Symbol.for('shopifyCartWatcher.patchedXHR'),
            };

            const isCartAdd = (url) => {
                try {
                    const u = new URL(typeof url === 'string' ? url : url.url, location.origin);
                    // normalize trailing slash
                    return u.pathname.replace(/\/+$/, '') === '/cart/add.js';
                } catch {
                    return typeof url === 'string' && url.includes('/cart/add.js');
                }
            };

            const fire = () => {
                try {
                    document.dispatchEvent(new CustomEvent('shopify:item-added'));
                } catch (_) {}
            };

            // ---- fetch ----
            if (!window[SYM.patchedFetch]) {
                const _fetch = window.fetch;
                window.fetch = async function(input, init) {
                const res = await _fetch.apply(this, arguments);
                try {
                    const url = typeof input === 'string' ? input : input && input.url;
                    if (isCartAdd(url) && res && res.ok) fire();
                } catch (_) {}
                    return res;
                };
                Object.defineProperty(window, SYM.patchedFetch, { value: true });
            }

            // ---- XHR ----
            if (!XMLHttpRequest[SYM.patchedXHR]) {
                const open = XMLHttpRequest.prototype.open;
                const send = XMLHttpRequest.prototype.send;

                XMLHttpRequest.prototype.open = function(method, url, ...rest) {
                this.__shopifyCartURL = url;
                return open.call(this, method, url, ...rest);
                };

                XMLHttpRequest.prototype.send = function(body) {
                try {
                    this.addEventListener('loadend', () => {
                    try {
                        if (isCartAdd(this.__shopifyCartURL) && this.status >= 200 && this.status < 300) {
                        fire();
                        }
                    } catch (_) {}
                    });
                } catch (_) {}
                    return send.call(this, body);
                };

                Object.defineProperty(XMLHttpRequest, SYM.patchedXHR, { value: true });
            }

            // (Optional best-effort) Non-AJAX form submits. Fires *before* navigation.
            document.addEventListener('submit', (e) => {
                try {
                    const form = e.target;
                    if (!(form instanceof HTMLFormElement)) return;
                    const action = form.getAttribute('action') || '';
                    if (action.startsWith('/cart/add')) {
                        // Best effort; may navigate away immediately
                        // Comment out if you strictly want only confirmed 2xx adds.
                        document.dispatchEvent(new CustomEvent('shopify:item-added:attempt'));
                    }
                } catch (_) {}
            }, true);
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
    }
}

(function(global) {
    if (!global.printAppPrintShopifyInstance) {
        const params = {
                productPage: window.location.pathname.includes('/products'),
                cartPage: window.location.pathname.includes('/cart'),
                accountPage: window.location.pathname.includes('/account'),
                hostname: window.location.hostname,
                storeId: window.Shopify.shop,
                productId: window.__st.rid,
            };
        global.printAppPrintShopifyInstance ??= new PrintAppShopify(params);
    }
})(globalThis);