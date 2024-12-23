
/* PrintAppClient */

class PrintAppPrestashop extends PrintAppClient {
    constructor(params) {
        const cartForm = document.querySelector('#add_to_cart,.product-add-to-cart,#ag_add_to_cart');
        cartForm?.parentNode?.insertAdjacentHTML?.('afterbegin', '<div id="pa-buttons"></div>');
        
        super({
            commandSelector: '#pa-buttons',
            previewsSelector: '#content',
            cartButton: '#add_to_cart,.product-add-to-cart,#ag_add_to_cart',
            ...params,
        });
        this.params = params;
        this.on('app:saved', this.saveProject);
        this.on('app:project:reset', this.resetProject);
        this.readyComm();
    }
    
    async resetProject(event) {
        const data = { 'product_id': this.params.product.id, clear: true };
        await this.comm.post(this.params.product.url, data);
        window.location.reload()
    }
    
    async saveProject(e) {
        const data = {
            values: JSON.stringify(e.data),
            id_product: this.params.product?.id,
            ajax: 1
        };
        await this.comm.post(this.params.product?.url, data);
    }

    readyComm() {
        const req   = new XMLHttpRequest();
        this.comm   = {
            post: (url, input) => new Promise( (res,rej) => {
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
