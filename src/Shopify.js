
class PrintAppShopify {
	static NAME = 'print-app-shopify';
	static VERSION = '0.1';
	static STORAGEKEY = 'print-app-sp';
	static PROJECTSKEY = 'print-app-sp-projects';
	static ENDPOINTS = {
        apiBase: 'https://api.print.app/carts/',
		baseCdn: 'https://editor.print.app/'
	};

	static SELECTORS = {
        previews: '.product__media-wrapper,.image,#product-photo-container,.product-left-column,.main-image,.product-photo-container,.featured,#image-block,.product-single-photos,.product_slider,#product-image,.photos,.product-single__photos,.image__container',
        cartForm: '[data-type="add-to-cart-form"],[action="/cart/add"],[action="/cart/add.js"],#add-item-form,#add-to-cart-form,[action$="/cart/add"], #AddToCartForm',
    };
    model = { };

	constructor(params) {
		if (!params) return console.error('Parameters required but undefined was passed'); 
		this.init(params);
	}
	
	async init(params) {
	    this.model = { ...params };

        if (!this.model.hostname) return console.error('This script needs to be loaded via wire');

        if (this.model.accountPage) return this.doClientAccount();
        if (this.model.cartPage) return await this.setCartImages();

        if (this.model.productPage) {
            await this.getUser();
            window.addEventListener('DOMContentLoaded', this.check);
            this.check();
        }
	}

    async check() {
        if (window.pprintset) return;

        this.model.cartForm = PrintAppShopify.queryPrioritySelector(PrintAppShopify.SELECTORS.cartForm);
        if (!this.model.cartForm) return;

        this.model.cartForm.insertAdjacentHTML('afterbegin', `<div id="pa-buttons"><img src="${PrintAppShopify.ENDPOINTS.baseCdn}assets/images/loader.svg"style="width:2rem"></div>`);
        window.pprintset = true;

        const paData = await PrintAppShopify.comm(`${PrintAppShopify.ENDPOINTS.apiBase}check-product`, { storeId: this.model.storeId, productId: this.model.productId, cart: 'sp' });
        if (!paData || !paData.designs || !paData.designs.length) {
            let sec = document.getElementById('pa-buttons');
            sec && sec.remove();
            return;
        }
        this.model.designData = paData;
        this.mountClient();
    }

    async mountClient() {
        await PrintAppShopify.loadTag(`${PrintAppShopify.ENDPOINTS.baseCdn}js/client.js`);

    	if (this.model.clientMounted || typeof PrintAppClient !== 'function') return;

    	let titleTag = document.querySelector('[property="og:title"]');
        if (titleTag) this.model.title = titleTag.getAttribute('content');
        
        let store = PrintAppShopify.getStorage(PrintAppShopify.STORAGEKEY);
        let currentValue = store[this.model.productId] || {};
        if (!document.getElementById('_printapp')) this.model.cartForm.insertAdjacentHTML('afterbegin', `<input id="_printapp" name="properties[_printapp]" type="hidden" value="${currentValue.projectId || ''}">`);
        
        this.model.instance = new PrintAppClient({
            langCode: document.lastChild.getAttribute('lang') || 'en',
            product: {
				id: this.model.productId,
				name: window.__st.pageurl.split('/').pop().split('-').join(' '),
				title: this.model.title,
				url: window.location.href
			},
            client: 'sp',
            domainKey: `dom_sp_${this.model.storeId}`,
            designList: this.model.designData?.designs,
            projectId: currentValue.projectId,
            mode: currentValue.projectId ? 'edit-project' : 'new-project',
            commandSelector: '#pa-buttons',
            previewsSelector: PrintAppShopify.SELECTORS.previews,
        });
        
		this.model.clientMounted = true;
		this.model.instance.on('app:saved', data => this.projectSaved(data));
		this.model.instance.on('app:project:reset', data => this.clearProject(data));
    }

    clearProject(value) {
        const { projectId } = value;
        let store = PrintAppShopify.getStorage(PrintAppShopify.STORAGEKEY),
        	projects = PrintAppShopify.getStorage(PrintAppShopify.PROJECTSKEY),
            element = this.getElement();

        if (element) element.value = '';
        delete store[this.model.productId];
        delete projects[projectId];

        window.localStorage.setItem(PrintAppShopify.STORAGEKEY, JSON.stringify(store));
	    window.localStorage.setItem(PrintAppShopify.PROJECTSKEY, JSON.stringify(projects));
	    window.location.reload();
    }
    projectSaved(value) {
        const { data } = value;
        
        let store = PrintAppShopify.getStorage(PrintAppShopify.STORAGEKEY),
        	projects = PrintAppShopify.getStorage(PrintAppShopify.PROJECTSKEY),
            element = this.getElement();
        	
		if (data.clear) {
            if (element) element.value = '';
		    delete store[this.model.productId];
		    delete projects[data.projectId];
		} else {
            if (element) element.value = data.projectId;
		    store[this.model.productId] = data;
		    projects[data.projectId] = data;
		}
	    window.localStorage.setItem(PrintAppShopify.STORAGEKEY, JSON.stringify(store));
	    window.localStorage.setItem(PrintAppShopify.PROJECTSKEY, JSON.stringify(projects));
	    if (data.clear) window.location.reload();
    }

    doClientAccount() {

    }
    getElement() {
        return document.getElementById(`_printapp`);
    }
    static getStorage(key) {
        let r = window.localStorage.getItem(key);
        if (typeof r === 'string') return PrintAppShopify.parse(r);
        return r || {};
    }

    async setCartImages() {
        const data = await PrintAppShopify.comm(`/cart.js`, null, 'GET').catch(console.log);
        if (!data || !data.items) return;

        if (data.items) {
            var value, string,
                elements = document.querySelectorAll('[data-cart-line], .cart-item, .cart__item'),
                imageSelector = '.line-item__image-wrapper > .aspect-ratio, .cart-line-image,.product_image,.cart_image,.product-image,.cpro_item_inner,.cart__image,.cart-image,.cart-item .image,.cart-item__image-container,.cart_page_image,.tt-cart__product_image,.CartItem__ImageWrapper,div.description.cf > a,.product-img, .cart-item-wrapper>.cart-item-block-left .cart-item-image img, .order-summary__body>tr>td>.line-item>.line-item__media-wrapper, .image-wrap>image-element>.image-element',
                images = document.querySelectorAll(imageSelector);
            const projects = PrintAppShopify.getStorage(PrintAppShopify.PROJECTSKEY);
            
            data.items.forEach((item, index) => {
                if (item?.properties?.['_printapp']) {
                    value = projects[item.properties['_printapp']];
                    console.log('value', value);
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
        // TODO.. get user data
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
    static async comm (url, data, method = 'POST', asRaw) {
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
		
		const   headers = new window.Headers();
		headers.append('Content-Type', cType);
		
		let response = await window.fetch(url, {
                        method: method,
                        headers: headers,
                        body: formData
                    }).then(d => {
                        if (asRaw) return d.text();
                        if (d) return d.json();
                        return new Error('Communication error');
                    });
        if (!(response instanceof Error)) return response;
	}

    static queryPrioritySelector(selectors) {

        const list = (typeof selectors === 'string') ? selectors.split(',') : selectors;
        for (let selector of list) {
            const element = document.querySelector(selector);
            if (element) return element;
        }
        return null;
    }
	
}

(function(global) {
    let params = {
        productPage: window.location.pathname.includes('/products'),
        cartPage: window.location.pathname.includes('/cart'),
        accountPage: window.location.pathname.includes('/account'),
        langCode: document.querySelector('html').getAttribute('lang') || 'en',
        hostname: window.location.hostname,
        storeId: window.Shopify.shop,
        productId: window.__st.rid,
    };
    global.printAppPrintShopifyInstance = global.printAppPrintShopifyInstance || new PrintAppShopify(params);

})(this);