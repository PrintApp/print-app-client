/* PrintAppClient */
// Created

class PrintAppOpenCart extends PrintAppClient {
    constructor(params) {
        super({
            ...params,
            commandSelector: '#pa-buttons',
            previewsSelector: '.popup-gallery,.thumbnails,.image-container,.product-gallery,.image,.large-image'
        });
        this.params = params;
        this.on('app:saved', this.saveProject);
        this.on('app:project:reset', this.resetProject);
    }

    async resetProject(event) {
        const data = { productId: this.params.product.id, clear : true };
        await this.comm.post(this.params.product.url, data);
        window.location.reload()
        
    }

    createInput(optId) {
        const   node = document.createElement('input');
                node.setAttribute('type', 'hidden');
                node.setAttribute('id', `input-option${optId}`);
                node.setAttribute('name', `option[${optId}]`);

        document.querySelector(this.params.commandSelector).insertAdjacentElement('afterend', node);
        return node;
    }

    async saveProject(event) {
        const pa_values = encodeURIComponent(JSON.stringify(event.data));
        
        let input = document.querySelector(`#input-option${this.params.paOptionId}`);
        if (!input) input = this.createInput(this.params.paOptionId);
        input.value = pa_values;

        const data = { pa_values };
        await this.comm.post(this.params.product.url, data);
    }
}
