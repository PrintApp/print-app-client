
/* PrintAppClient */

// Shopware 6 shim. Parameters arrive through window.printAppParams, written by
// the app's buy-widget Twig override (print-app-shopware repo):
//   product: { id (UUID), number, name }, langCode, cookieKey
// Session model mirrors the Shopify shim: project state in localStorage per
// product, and the cart carry-through is a hidden payload input on the buy
// form — Shopware persists line-item payload onto the order line by itself.

class PrintAppShopware extends PrintAppClient {
    static STORAGEKEY = 'print-app-sw';
    static SELECTORS = {
        buyForm: 'form.buy-widget, form[action*="/checkout/line-item/add"], .buy-widget-container form',
        previews: '.gallery-slider, .gallery-slider-row, .product-detail-media',
    };

    constructor (params) {
        const store = PrintAppShopware.getStorage();
        const current = store[params?.product?.id] || {};

        if (!document.querySelector('#pa-buttons')) {
            document.querySelector(PrintAppShopware.SELECTORS.buyForm)
                ?.insertAdjacentHTML?.('beforebegin', '<div id="pa-buttons"></div>');
        }

        super({
            commandSelector: '#pa-buttons',
            previewsSelector: PrintAppShopware.SELECTORS.previews,
            projectId: current.projectId,
            previews: current.previews,
            mode: current.projectId ? 'edit-project' : 'new-project',
            ...params,
        });
        this.params = params;
        this.ensurePayloadInput(current);
        this.on('app:saved', this.saveProject.bind(this));
        this.on('app:project:reset', this.resetProject.bind(this));
    }

    buyForm() {
        return document.querySelector(PrintAppShopware.SELECTORS.buyForm);
    }

    // Hidden input carrying the project onto the cart line. The storefront
    // controller JSON-decodes string payload values (256KB cap) and the key
    // survives product enrichment; we use our own top-level key, never
    // customFields (promotions have historically wiped that one).
    ensurePayloadInput(value) {
        const form = this.buyForm();
        const productId = this.params?.product?.id;
        if (!form || !productId) return;
        let input = form.querySelector('input[data-printapp]');
        if (!input) {
            input = document.createElement('input');
            input.type = 'hidden';
            input.name = `lineItems[${productId}][payload]`;
            input.setAttribute('data-printapp', '1');
            form.appendChild(input);
        }
        input.value = value?.projectId
            ? JSON.stringify({ printapp: {
                projectId: value.projectId,
                previewUrl: value.previews?.[0]?.url || '',
            } })
            : '';
    }

    saveProject(event) {
        const data = event?.data || {};
        const store = PrintAppShopware.getStorage();
        store[this.params.product.id] = {
            projectId: data.projectId,
            previews: data.previews,
        };
        window.localStorage.setItem(PrintAppShopware.STORAGEKEY, JSON.stringify(store));
        this.ensurePayloadInput(store[this.params.product.id]);
    }

    resetProject() {
        const store = PrintAppShopware.getStorage();
        delete store[this.params.product.id];
        window.localStorage.setItem(PrintAppShopware.STORAGEKEY, JSON.stringify(store));
        this.ensurePayloadInput(null);
        window.location.reload();
    }

    static getStorage() {
        try {
            return JSON.parse(window.localStorage.getItem(PrintAppShopware.STORAGEKEY)) || {};
        } catch (e) { return {}; }
    }
}
