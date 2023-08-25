/* PrintAppClient */// Created

class PrintAppPrestashop extends PrintAppClient {
    constructor(params) {
        super({
            commandSelector: '#pa-buttons',
            previewsSelector: '.js-qv-product-cover',
            cartButton: '#add_to_cart,.product-add-to-cart,#ag_add_to_cart',
            ...params,
        });
        this.params = params;
        this.on('app:saved', this.saveProject);
        this.on('app:project:reset', this.resetProject);
    }
    
    async resetProject(event) {
        const data = { 'product_id': this.params.product.id, action: 'print_dot_app_reset_project' };
        await this.comm.post(window.wp_ajax_url, data);
        window.location.reload()
    }
    
    async saveProject(e) {
        const data = {
            values: JSON.stringify(e.data),
            id_product: this.params.product.id,
            ajax: 1
        };
        await this.comm.post(this.params.product.url,data);
    }
}
