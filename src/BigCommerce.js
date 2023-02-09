
class PrintAppBigCommerce {
	static NAME = 'print-app-big-commerce';
	static VERSION = '0.1';
	static STORAGEKEY = 'print-app-bc';
	static PROJECTSKEY = 'print-app-bc-projects';
	static ENDPOINTS = {
        apiBase: 'https://api.print.app/carts/',
		baseCdn: 'https://editor.print.app/'
	};

	SELECTORS = { };
    model = { };

	constructor(params) {
		if (!params) return console.error('Parameters required but undefined was passed'); 
		this.init(params);
	}
	
	async init(params) {
	    this.model = {
            ...params,
		};
        if (!this.model.hostname) return console.error('This script needs to be loaded via wire');
		await this.getUser();
        window.addEventListener('DOMContentLoaded', this.check);
	
        const fn = () => setTimeout(() => {
            window.pprintset = false;
            this.check();
        }, 1500);
        const qry = document.querySelectorAll('.quickview');
        if (qry) qry.forEach(btn => btn.addEventListener('click', fn));
        this.check();
	}

    async check() {
        var el = document.querySelector('[name="product_id"]');
        if (window.pprintset || !el) return;

        const  cartForm = document.querySelector('[data-cart-item-add],#form-action-addToCart');
        if (!cartForm) return;

        const productId = Number(el.value);
        cartForm.insertAdjacentHTML('afterbegin', `<div id="pa-buttons"><img src="${PrintAppBigCommerce.ENDPOINTS.baseCdn}assets/images/loader.svg"style="width:2rem"></div>`);
        window.pprintset = true;
        this.model.productId = productId;

        const paData = await PrintAppBigCommerce.comm(`${PrintAppBigCommerce.ENDPOINTS.apiBase}check-product`, { storeId: this.model.storeId, productId, cart: 'bc' });
        if (!paData || !paData.designId) {
            let sec = document.getElementById('pa-buttons');
            sec && sec.remove();
            return;
        }
        this.model.designData = paData;
        this.mountClient();
    }

    async mountClient() {
        await PrintAppBigCommerce.loadTag(`${PrintAppBigCommerce.ENDPOINTS.baseCdn}js/client.js`);
        
        if (window.location.href.indexOf('/account.php?action=order_status') !== -1) return this.doClientAccount();
    	if (this.model.clientMounted || typeof PrintAppClient !== 'function') return;

    	let titleTag = document.querySelector('[property="og:title"]');
        if (titleTag) this.model.title = titleTag.getAttribute('content');
        
        let store = window.localStorage.getItem(PrintAppBigCommerce.STORAGEKEY) || { };
        if (typeof store === 'string') store = PrintAppBigCommerce.parse(store);
        let currentValue = store[this.model.productId] || {};
        
        if (currentValue && currentValue.projectId) {
        	var element = this.getElement();
        	if (element) element.value = currentValue.projectId;
        }

        if (this.model.designData.modifierId) {
            var selector = this.getElement();
            if (selector) {
                selector.value = '';
                if (selector.parentNode) selector.parentNode.style.display = 'none';
            }
        }

        this.model.instance = new PrintAppClient({
            langCode: document.lastChild.getAttribute('lang') || 'en',
            product: {
				id: this.model.productId,
				name: document.title.split('-')[0],
				title: this.model.title,
				url: window.location.href
			},
            client: 'bc',
            domainKey: `dom_bc_${this.model.storeId}`,
            designId: this.model.designData && this.model.designData.designId,
            mode: 'new-project',
            commandSelector: '#pa-buttons',
            previewsSelector: '[data-image-gallery]',
        });
        
		this.model.clientMounted = true;
        // this.model.instance.on('app:ready', appReady);
		this.model.instance.on('app:saved', _ => this.projectSaved(_));
    }

    projectSaved(value) {
        const { data } = value;
        console.log(data);
        let store = window.localStorage.getItem(PrintAppBigCommerce.STORAGEKEY),
        	projects = window.localStorage.getItem(PrintAppBigCommerce.PROJECTSKEY),
            element = this.getElement();
        	
		if (typeof store === 'string') store = PrintAppBigCommerce.parse(store);
	    if (typeof projects === 'string') projects = PrintAppBigCommerce.parse(projects);
	    
		if (data.clear) {
            element.value = '';
		    delete store[this.model.productId];
		    delete projects[data.projectId];
		} else {
            element.value = data.projectId;
		    store[this.model.productId] = data;
		    projects[data.projectId] = data;
		}
	    window.localStorage.setItem(PrintAppBigCommerce.STORAGEKEY, JSON.stringify(store));
	    window.localStorage.setItem(PrintAppBigCommerce.PROJECTSKEY, JSON.stringify(projects));
	    if (data.clear) window.location.reload();
    }

    doClientAccount() {

    }
    getElement() {
        return document.querySelector(`[name="attribute[${this.model.designData.modifierId}]"]`);
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
        const data = await PrintAppBigCommerce.comm(`https://${this.model.hostname}/customer/current.jwt?app_client_id=${this.model.appClientId}`, null, 'GET', true);
        if (!data || typeof data !== 'string') return null;
        var base64Url = data.split('.')[1];
        var base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        try {
            var jsonPayload =   decodeURIComponent(window.atob(base64).split('').map(function(c) {
                return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
            }).join(''));
            this.model.userData = PrintAppBigCommerce.parse(jsonPayload);
        } catch(e) {}
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
	
}

(function(global) {
    let params = {
        appClientId: 'qn84vtdxawif6a0rto032ot1vsrszh',
        storeId: document.currentScript ? document.currentScript.src.split('?')[1] : null,
        hostname: window.location.hostname
    };
    global.printAppBigCommerceInstance = global.printAppBigCommerceInstance || new PrintAppBigCommerce(params);
})(this);