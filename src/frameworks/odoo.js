
/* PrintAppClient */

// Parameters arrive through window.printAppParams, written by the Odoo addon's
// QWeb template (print-app-odoo repo) and merged into the constructor call by
// the run.print.app bootstrap. Expected shape:
//   mode, langCode, previews, projectId,
//   product: { id, name, url },       // id is the product.template id
//   userId, launchData, cookieKey,
//   endpoints: { save, reset },       // addon controller routes
//   csrf_token                        // unused by the JSON-RPC transport, kept for future form posts

class PrintAppOdoo extends PrintAppClient {
    constructor (params) {
        // Themes that override website_sale.product can drop the addon's mount
        // point; recreate it next to the add-to-cart button so the command UI
        // still has somewhere to live.
        if (!document.querySelector('#pa-buttons')) {
            document.querySelector('#add_to_cart')?.insertAdjacentHTML?.('beforebegin', '<div id="pa-buttons"></div>');
        }
        super({
            commandSelector: '#pa-buttons',
            // Image gallery only — never an ancestor like #product_detail:
            // updatePreviews() replaces the innerHTML of the first match, and
            // an ancestor always precedes its children in document order.
            previewsSelector: '#o-carousel-product,#o-grid-product,.o_wsale_product_images',
            cartButton: '#add_to_cart,#buy_now,a[name="add_to_cart"]',
            ...params,
        });
        this.params = params;
        this.on('app:saved', this.saveProject.bind(this));
        this.on('app:project:reset', this.resetProject.bind(this));
    }

    async resetProject() {
        await this.rpc(this.params.endpoints?.reset || '/printapp/reset_project', {
            product_id: this.params.product?.id,
        });
        window.location.reload();
    }

    async saveProject(event) {
        const response = await this.rpc(this.params.endpoints?.save || '/printapp/save_project', {
            product_id: this.params.product?.id || event.data.productId,
            value: event.data,
        });
        if (event.data.saveForLater) window.location.href = '/my/designs';
        return response;
    }

    // Odoo `type='json'` routes only accept a JSON-RPC 2.0 envelope with an
    // application/json content type, which a cross-site form cannot produce —
    // that (plus the session cookie scope) is the CSRF story here.
    // NOTE: Odoo 19 renames these routes to type='jsonrpc'; revisit on the 19 port.
    async rpc(url, params) {
        const res = await fetch(url, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params, id: Date.now() }),
        });
        if (!res.ok) throw new Error(`HTTP error! Status: ${res.status}`);
        const data = await res.json();
        if (data.error) throw new Error(data.error.data?.message || data.error.message);
        return data.result;
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
                    </div>
                </div>
            </div>`

        this.model.ui.vue = window.PetiteVue.reactive({
            lang: this.model.env.language,
            projects: this.model.env.userProjects,
            resumeProject: this.resumeProject.bind(this),
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
        const   projectId = event?.target?.closest?.('[data-project-id]')?.dataset?.projectId || event?.target?.dataset?.projectId,
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
        const response = await this.rpc(this.params.endpoints?.save || '/printapp/save_project', {
            product_id: dataSource.product?.id,
            value: data,
        });
        if (response?.productUrl) window.location.href = response.productUrl;
    }
}
