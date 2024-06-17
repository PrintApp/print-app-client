
if (typeof this.PrintAppShopify === "undefined") {
    
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
            window.addEventListener('DOMContentLoaded', this.check);
            this.check();
        }

        async check() {
            if (window.printappset) return;

            this.model.cartForm = window.PrintAppShopify.queryPrioritySelector(window.PrintAppShopify.SELECTORS.cartForm);
            if (!this.model.productId)
                this.model.productId = this.model.cartForm?.querySelector('input[name="product-id"]')?.value;

            if (!this.model.cartForm || !this.model.productId) return;

            this.model.cartForm.insertAdjacentHTML('afterbegin', `<div id="pa-buttons"><img src="${window.PrintAppShopify.ENDPOINTS.baseCdn}assets/images/loader.svg"style="width:2rem"></div>`);
            window.printappset = true;

            const paData = await fetch(`${window.PrintAppShopify.ENDPOINTS.runCdn}dom_sp_${this.model.storeId}/${this.model.productId}/sp?lang=${this.model.langCode}`)
                                .then(d => d.json())
                                .catch(console.log);

            if (!paData?.designs?.length && !paData?.artwork && !Object.keys(paData?.variants || {}).length) {
                let sec = document.getElementById('pa-buttons');
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
        }

        clearProject(value) {
            const { projectId } = value;
            let store = window.PrintAppShopify.getStorage(window.PrintAppShopify.STORAGEKEY),
                projects = window.PrintAppShopify.getStorage(window.PrintAppShopify.PROJECTSKEY);

            this.setElementValue('');
            delete store[this.model.productId];
            delete projects[projectId];

            window.localStorage.setItem(window.PrintAppShopify.STORAGEKEY, JSON.stringify(store));
            window.localStorage.setItem(window.PrintAppShopify.PROJECTSKEY, JSON.stringify(projects));
            window.location.reload();
        }
        projectSaved(value) {
            const { data } = value;
            
            let store = window.PrintAppShopify.getStorage(window.PrintAppShopify.STORAGEKEY),
                projects = window.PrintAppShopify.getStorage(window.PrintAppShopify.PROJECTSKEY);
                
            if (data.clear) {
                this.setElementValue('');
                delete store[this.model.productId];
                delete projects[data.projectId];
            } else {
                this.setElementValue(data.projectId);
                store[this.model.productId] = data;
                projects[data.projectId] = data;
            }
            window.localStorage.setItem(window.PrintAppShopify.STORAGEKEY, JSON.stringify(store));
            window.localStorage.setItem(window.PrintAppShopify.PROJECTSKEY, JSON.stringify(projects));
            if (data.clear) {
                window.location.reload();
            } else {
                this.setAddToCartAction();
            }
        }
        setElementValue(value) {
            let element = document.getElementById(`_printapp`),
                pdfElement = document.getElementById(`_printapp-pdf-download`);

            if (element) element.value = value;
            if (pdfElement) {
                if (value) {
                    pdfElement.value = `${window.PrintAppShopify.ENDPOINTS.pdf}${value}`;
                } else {
                    pdfElement.value = '';
                }
            }
        }
        setAddToCartAction() {
			if (!this.model.instance || (this.model.instance?.model?.env?.settings?.displayMode === 'mini')) return;
            const   paInstance = this.model.instance,
                    cartButton = paInstance?.model?.ui?.cartButton;
			if (!cartButton) return;

			const clearFnc = () =>
				setTimeout(() => this.projectSaved({ data: { clear: true }}), 1000);

			cartButton.removeEventListener('click', clearFnc);
			cartButton.addEventListener('click', clearFnc);
	    }

        doClientAccount() { }
        
        static getStorage(key) {
            let r = window.localStorage.getItem(key);
            if (typeof r === 'string') return window.PrintAppShopify.parse(r);
            return r || {};
        }

        async setCartImages() {
            const data = await fetch('/cart.js')
                        .then(d => d.json()).catch(console.log);
            if (!data?.items) return;

            var value, string,
                imageSelector = '.line-item__image-wrapper > .aspect-ratio, .cart-line-image,.product_image,.cart_image,.product-image,.cpro_item_inner,.cart__image,.cart-image,.cart-item .image,.cart-item__image-container,.cart_page_image,.tt-cart__product_image,.CartItem__ImageWrapper,div.description.cf > a,.product-img, .cart-item-wrapper>.cart-item-block-left .cart-item-image img, .order-summary__body>tr>td>.line-item>.line-item__media-wrapper, .image-wrap>image-element>.image-element',
                images = document.querySelectorAll(imageSelector);
            const projects = window.PrintAppShopify.getStorage(window.PrintAppShopify.PROJECTSKEY);
            
            data.items.forEach((item, index) => {
                if (item?.properties?.['_printapp']) {
                    value = projects[item.properties['_printapp']];
                    
                    string = `<div><img src="${value.previews[0].url}" width="94" style="margin: 5px; opacity: 1"><br/></div>`;
                    let img = images[index];
                    if (img) {
                        if (img.tagName === 'IMG') {
                            img.parentNode.innerHTML = string;
                        } else {
                            img.innerHTML = string;
                        }
                    }
                }
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
        
        static queryPrioritySelector(selectors) {
            const list = (typeof selectors === 'string') ? selectors.split(',') : selectors;
            for (let selector of list) {
                const elements = document.querySelectorAll(selector);
                for (let element of elements) {
                    if (element?.offsetParent) return element;
                }
            }
            return null;
        }
    }
}

(function(global) {
    if (!global.printAppPrintShopifyInstance) {
        let params = {
            productPage: window.location.pathname.includes('/products'),
            cartPage: window.location.pathname.includes('/cart'),
            accountPage: window.location.pathname.includes('/account'),
            hostname: window.location.hostname,
            storeId: window.Shopify.shop,
            productId: window.__st.rid,
        };
        global.printAppPrintShopifyInstance = global.printAppPrintShopifyInstance || new PrintAppShopify(params);
    }

})(this);