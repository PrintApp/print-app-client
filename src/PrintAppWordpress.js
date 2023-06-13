/* global wp_ajax_url */// Added in the plugin via wp_localize_script

/* PrintAppClient */// Created

class PrintAppWordpress extends PrintAppClient {
    constructor(params) {
        super({
            commandSelector: '#pa-buttons',
            previewsSelector: '.woocommerce-product-gallery',
            cartButton: '.single_add_to_cart_button,.kad_add_to_cart,.addtocart,#add-to-cart,.add_to_cart,#add,#AddToCart,#product-add-to-cart,#add_to_cart,#button-cart,#AddToCart-product-template,.product-details-wrapper .add-to-cart,.btn-addtocart,.ProductForm__AddToCart,.add_to_cart_product_page,#addToCart,[name="add"],[data-button-action="add-to-cart"],#Add,#form-action-addToCart',
            ...params,
        });
        this.params = params;
        this.on('app:saved', this.saveProject);
        this.on('app:project:reset', this.resetProject);
    }
    
    async resetProject(event) {
        const data = { 'product_id': this.params.product.id, action: 'print_app_reset_project' };
        await PrintAppClient.comm(window.wp_ajax_url, data);
        window.location.reload();
    }
    
    async saveProject(event) {
        const data = {
            'action': 'print_app_save_project',
            'value': JSON.stringify(event.data),
            'product_id': this.params.product.id
        };
        await PrintAppClient.comm(window.wp_ajax_url, data);
    }
}