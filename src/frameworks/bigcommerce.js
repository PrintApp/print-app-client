
class PrintAppBigCommerce {
	static NAME = 'print-app-big-commerce';
	static VERSION = '0.1';
	static STORAGEKEY = 'print-app-bc';
	static PROJECTSKEY = 'print-app-bc-projects';
	static ENDPOINTS = {
        apiBase: 'https://api.print.app/carts/',
		baseCdn: 'https://editor.print.app/',
        runCdn: 'https://run.print.app/',
	};

	SELECTORS = { };
    model = { };

	constructor(params) {
		if (!params) return console.error('Parameters required but undefined was passed'); 
		this.init(params);
	}
	
	async init(params) {
	    this.model = { ...params };

        if (!this.model.hostname) return console.error('This script needs to be loaded via wire');

        if (window.location.href.includes('/account.php?action=order_status')) return this.doClientAccount();
        if (window.location.href.includes('/cart.php')) return await this.setCartImages();

		await this.getUser();
        window.addEventListener('DOMContentLoaded', this.check);

        this.model.langCode = document.querySelector('html').getAttribute('lang') || 'en';
        let metaLangTag = document.querySelector('[name="language-code"]');
        if (metaLangTag) this.model.langCode = metaLangTag.getAttribute('content') || this.model.langCode;
	
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

        // modifierId
        let nodes = document.querySelectorAll('[name^="attribute["]');
        if (nodes) nodes.forEach(node => {
            if (node.parentNode?.textContent?.includes('print-app')) {
                this.model.modifierId = node.name.split('[')[1].split(']')[0];
                node.parentNode.style.display = 'none';
            }
        });

        const paData = await fetch(`${PrintAppBigCommerce.ENDPOINTS.runCdn}dom_bc_${this.model.storeId}/${this.model.productId}/bc?lang=${this.model.langCode}`)
                        .then(d => d.json())
                        .catch(console.log);

        if (!paData?.designs?.length && !paData?.artwork) {
            let sec = document.getElementById('pa-buttons');
            return sec?.remove?.();
        }
        this.model.designData = paData;
        this.mountClient();
    }

    async mountClient() {
        await PrintAppBigCommerce.loadTag(`${PrintAppBigCommerce.ENDPOINTS.baseCdn}js/client.js`);

    	if (this.model.clientMounted || typeof PrintAppClient !== 'function') return;

    	let titleTag = document.querySelector('[property="og:title"]');
        if (titleTag) this.model.title = titleTag.getAttribute('content');
        
        let store = PrintAppBigCommerce.getStorage(PrintAppBigCommerce.STORAGEKEY);
        let currentValue = store[this.model.productId] || {};
        var element = this.getElement();

        if (element) {
            element.value = currentValue?.projectId ? currentValue.projectId : '';
            if (element.parentNode?.style) element.parentNode.style.display = 'none';
        }

        this.model.instance = window.printAppInstance = new PrintAppClient({
            langCode: this.model.langCode,
            product: {
				id: this.model.productId,
				name: document.title.split('-')[0],
				title: this.model.title,
				url: window.location.href
			},
            framework: 'bc',
            domainKey: `dom_bc_${this.model.storeId}`,
            designList: this.model.designData?.designs,
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
        
        let store = PrintAppBigCommerce.getStorage(PrintAppBigCommerce.STORAGEKEY),
        	projects = PrintAppBigCommerce.getStorage(PrintAppBigCommerce.PROJECTSKEY),
            element = this.getElement();
        	
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
        return document.querySelector(`[name="attribute[${this.model.modifierId}]"]`);
    }
    static getStorage(key) {
        let r = window.localStorage.getItem(key);
        if (typeof r === 'string') return PrintAppBigCommerce.parse(r);
        return r || {};
    }


    async setCartImages() {
    	var params = { include: 'lineItems.digitalItems.options,lineItems.physicalItems.options' },
            element = document.querySelectorAll('.cart-item-figure');
        
        const data = await PrintAppBigCommerce.comm(`${window.location.protocol}//${window.location.host}/api/storefront/carts`, params, 'GET').catch(console.log);
        if (!Array.isArray(data)) return;
        const projects = PrintAppBigCommerce.getStorage(PrintAppBigCommerce.PROJECTSKEY);

        data.forEach(cart  => {
            if(cart && cart.lineItems) {
                cart.lineItems.physicalItems.forEach((lineItem, idx) => {
                    if(lineItem.options) {
                        var options = lineItem.options;
                        options.forEach(opt => {
                            if(opt.name === "print-app") {
                                let v = projects[opt.value];
                                element[idx].querySelector('IMG').src = v.previews[0].url;
                                element[idx].querySelector('IMG').srcset = v.previews[0].url;
                            }
                        })
                    }
                })
            }
        })
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