/* global wp_ajax_url */// Added in the plugin via wp_localize_script

/* PrintAppClient */// Created

class PrintAppWordpress extends PrintAppClient {
    constructor(params) {
        super({
            commandSelector: '#pa-buttons',
            previewsSelector: '.woocommerce-product-gallery,.product_image,.images,.single-product-image',
            cartButton: '.single_add_to_cart_button,.kad_add_to_cart,.addtocart,#add-to-cart,.add_to_cart,#add,#AddToCart,#product-add-to-cart,#add_to_cart,#button-cart,#AddToCart-product-template,.product-details-wrapper .add-to-cart,.btn-addtocart,.ProductForm__AddToCart,.add_to_cart_product_page,#addToCart,[name="add"],[data-button-action="add-to-cart"],#Add,#form-action-addToCart',
            ...params,
        });
        this.params = params;
        this.on('app:saved', this.saveProject);
        this.on('app:project:reset', this.resetProject);
        this.readyComm();
    }
    
    async resetProject(event) {
        const data = { 'product_id': this.params.product.id, action: 'print_app_reset_project' };
        await this.comm.post(window.printAppParams.wp_ajax_url, data);
        window.location.reload();
    }
    
    async saveProject(event) {
        const data = {
            'action': 'print_app_save_project',
            'value': JSON.stringify(event.data),
            'product_id': this.params.product.id
        };
        await this.comm.post(window.printAppParams.wp_ajax_url, data);
    }

    readyComm() {
        const req   = new XMLHttpRequest();
        this.comm   = {
            post: (url, input) => new Promise((res, rej) => {
                const data = new FormData();
                Object.keys(input).forEach(key=>{
                    data.append(key, input[key]);
                });
                req.onreadystatechange = function() {
                    if (req.readyState == 4) {
                        if (req.status == 200) 
                            res(req.responseText);
                        else
                            rej(req.responseText);
                    }
                };
                req.open('post', url);
                req.send(data);
            })
        }
    }
}