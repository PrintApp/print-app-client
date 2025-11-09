
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
            'product_id': this.params.product?.id || event.data.productId
        };
        const response = await this.post('print_app_save_project', data);
        if (event.data.saveForLater) window.location.href = './my-account/';
        return response;
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

    async renderUserProjects() {
        await window.PrintAppClient.loadTag(`https://editor.print.app/js/petite-vue.js`);
        this.model.ui.base = document.querySelector('#print-app-user-projects');
        if (!this.model.ui.base) return;
        this.loadStyling();

        // Using Petite-Vue's syntax for data binding
        this.model.ui.base.innerHTML = `
            <div id="print-app-projects" class="printapp-projects" v-scope>
                <h1 class="printapp-projects-title">{{lang.my_saved_designs || 'My saved designs'}}</h1>
                <div v-for="project in projects" class="printapp-project">
                    <div class="printapp-project-preview">
                        <img :src="project.pages[0]?.thumbnail" :alt="project.product.name" />
                    </div>
                    <div class="printapp-project-details">
                        <div class="printapp-project-name">{{project.product?.name}}</div>
                        <div class="printapp-project-date">{{formatDate(project.modified || project.created)}}</div>
                    </div>
                    <div class="printapp-project-actions">
                        <button @click.prevent.stop="resumeProject" :data-project-id="project.id" class="printapp-project-btn printapp-project-btn-duplicate">
                            <span v-if="project.saveForLater">{{lang.user_resume_project || 'Resume Design'}}</span>
                            <span v-else>{{lang.user_duplicate_project || 'Duplicate Design for Re-order'}}</span>
                        </button>
                        <!-- <button @click.prevent.stop="previewProject" :data-project-id="project.id" class="printapp-project-btn printapp-project-btn-preview">
                            <span class="printapp-icon-preview">👁️</span>
                        </button>
                        <button @click.prevent.stop="deleteProject" :data-project-id="project.id" class="printapp-project-btn printapp-project-btn-delete">
                            <span class="printapp-icon-delete">❌</span>
                        </button> -->
                    </div>
                </div>
            </div>`

        this.model.ui.vue = window.PetiteVue.reactive({
            lang: this.model.env.language,
            projects: this.model.env.userProjects,
            resumeProject: this.resumeProject.bind(this),
            previewProject: this.previewProject.bind(this),
            deleteProject: this.deleteProject.bind(this),
            formatDate: (timestamp) => {
                const date = new Date(timestamp);
                return date.toLocaleString(undefined, { 
                    year: 'numeric', 
                    month: 'short', 
                    day: 'numeric', 
                    hour: '2-digit', 
                    minute: '2-digit'
                });
            }
        });

        window.PetiteVue.createApp(this.model.ui.vue).mount('#print-app-user-projects')
    }

    async resumeProject(event) {
        const   projectId = event?.target?.dataset?.projectId,
                dataSource = this.model.env.userProjects.find(p => p.id === projectId);

        if (!dataSource) return;
        const data = {
            mode: dataSource.saveForLater ? 'edit-project' : 'new-project',
            projectId: projectId,
            userId: dataSource.userId,
            product: dataSource.product,
            productId: dataSource.product?.id,
            launchData: dataSource.launchData,
            previews: dataSource.pages.map(page => ( { url: page.preview } )),
            saveForLater: false,
        };
        const response = await this.saveProject({ data }).then(r => r.data);
        if (response.productUrl) window.location.href = response.productUrl;
    }

    previewProject(event) {
        const projectId = event?.target?.dataset?.projectId;
        // this.sendMsg('project:preview', { projectId });
    }

    deleteProject(event) {
        const projectId = event?.target?.dataset?.projectId;
        // this.sendMsg('project:delete', { projectId });
    }
}