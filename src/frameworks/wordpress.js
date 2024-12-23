
// Added in the plugin via wp_localize_script
/* global wp_ajax_url */

/* PrintAppClient */

class PrintAppWordpress extends PrintAppClient {
    constructor (params) {
        super({
            commandSelector: '#pa-buttons',
            previewsSelector: '.woocommerce-product-gallery,.product_image,.images,.single-product-image',
            cartButton: '.single_add_to_cart_button,.kad_add_to_cart,.addtocart,#add-to-cart,.add_to_cart,#add,#AddToCart,#product-add-to-cart,#add_to_cart,#button-cart,#AddToCart-product-template,.product-details-wrapper .add-to-cart,.btn-addtocart,.ProductForm__AddToCart,.add_to_cart_product_page,#addToCart,[name="add"],[data-button-action="add-to-cart"],#Add,#form-action-addToCart',
            ...params,
        });
        this.params = params;
        this.on('app:saved', this.saveProject);
        this.on('app:project:reset', this.resetProject);
    }
    
    async resetProject() {
        const data = { 'product_id': this.params.product.id };
        const reset = await this.post('print_app_reset_project', data);
        if (reset) window.location.reload();
    }
    
    async saveProject(event) {
        const data = {
            'value': JSON.stringify(event.data),
            'product_id': this.params.product?.id
        };
        const saved = await this.post('print_app_save_project', data);
        console.log(saved);
    }

    async post(action, data) {
        try {
            const formData = new URLSearchParams();
            formData.append('action', action);
            for (const key in data) {
                if (data.hasOwnProperty(key)) {
                    // Handle objects/arrays by stringifying them if necessary
                    const value = (typeof data[key] === 'object') ? JSON.stringify(data[key]) : data[key];
                    formData.append(key, value);
                }
            }
            const options = {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'Accept': 'application/json, text/javascript, */*;',
                },
                body: formData.toString(),
            };
            const response = await fetch(window.printAppParams.wp_ajax_url, options);
            if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
            
            return await response.json();

        } catch (error) {
            throw error;
        }
    }
}