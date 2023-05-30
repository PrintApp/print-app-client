/* global wp_ajax_url */// Added in the plugin via wp_localize_script

class PrintAppWordpress extends PrintAppClient {
    constructor(params) {
        super(params);
        this.params = params;
        this.selectors = {};
        this.selectors.qryCartBtn = '.single_add_to_cart_button,.kad_add_to_cart,.addtocart,#add-to-cart,.add_to_cart,#add,#AddToCart,#product-add-to-cart,#add_to_cart,#button-cart,#AddToCart-product-template,.product-details-wrapper .add-to-cart,.btn-addtocart,.ProductForm__AddToCart,.add_to_cart_product_page,#addToCart,[name="add"],[data-button-action="add-to-cart"],#Add,#form-action-addToCart';
        this.on('app:saved', this.paw_saveProject);
        this.on('app:project:reset', this.paw_resetProject);
        this.readyComm();
        
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
    
    async paw_resetProject(event) {
        event.preventDefault();
        const data = { 'product_id': this.params.product.id, action: 'print_app_reset_project' };
        await this.comm.post(window.wp_ajax_url, data);
        window.location.reload();
    }
    
    async paw_saveProject(event) {
        const projectId = event.data.projectId, 
            data = {
                'action': 'print_app_save_project',
                'value': JSON.stringify(event.data),
                'product_id': this.params.product.id
            };
        await this.comm.post(window.wp_ajax_url, data);
    }
}