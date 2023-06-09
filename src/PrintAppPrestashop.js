/* PrintAppClient */// Created

class PrintAppPrestashop extends PrintAppClient {
        constructor(params) {
            super(params);
            this.params = params;
            this.selectors = {};
            this.selectors.qryCartBtn = "#add_to_cart,.product-add-to-cart,#ag_add_to_cart";
            // this.on('app:ready', this.createBtns);
            this.on('app:saved', this.saveProject);
            this.readyComm();
            
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
        
        createBtns() {
            const cartBtn = document.querySelector(this.selectors.qryCartBtn);
            if (cartBtn) {
                this.launch_btn = document.createElement('button');
                this.launch_btn.innerText = 'Launch Designer';
                this.launch_btn.onclick = e => this.papresta_startEditor(e);
                this.launch_btn.classList.add('px-6');
                this.launch_btn.classList.add('btn');
                this.launch_btn.classList.add('btn-warning');
                this.launch_btn.style['margin-right'] = '10px';
                if (this.params.mode != 'new-project')
                    this.launch_btn.style.display = 'none';
                cartBtn.parentElement.prepend(this.launch_btn);
                
                this.reset_btn = document.createElement('button');
                this.reset_btn.innerText = 'Reset Project';
                this.reset_btn.onclick = e => this.papresta_resetProject(e);
                this.reset_btn.classList.add('px-6');
                this.reset_btn.classList.add('btn');
                this.reset_btn.classList.add('btn-success');
                this.reset_btn.classList.add('papresta_edit');
                this.reset_btn.style['margin-right'] = '10px';
                if (this.params.mode == 'new-project')
                    this.reset_btn.style.display = 'none';
                cartBtn.parentElement.prepend(this.reset_btn);
                
                this.edit_btn = document.createElement('button');
                this.edit_btn.innerText = 'Edit Project';
                this.edit_btn.onclick = e => this.papresta_startEditor(e);
                this.edit_btn.classList.add('px-6');
                this.edit_btn.classList.add('btn');
                this.edit_btn.classList.add('btn-warning');
                this.edit_btn.classList.add('papresta_edit');
                this.edit_btn.style['margin-right'] = '10px';
                if (this.params.mode == 'new-project')
                    this.edit_btn.style.display = 'none';
                cartBtn.parentElement.prepend(this.edit_btn);
            }
        }
        
        async papresta_resetProject(e) {
            e.preventDefault();
            const data = { 'product_id': this.params.product.id, action: 'print_dot_app_reset_project' };
            await this.comm.post(wp_ajax_url, data);
            window.location.reload()
            
        }
        
        papresta_startEditor(e) {
            e.preventDefault();
            this.showApp();
        }
        
        showEditBtns() {
            this.launch_btn.style.display = 'none';
            this.edit_btn.style.display = 'block';
            this.reset_btn.style.display = 'block';
        }
        
        async saveProject(e) {
            const data = {
                    'values': JSON.stringify(e.data),
                    'id_product': this.params.product.id,
                    'ajax': 1
                };
            await this.comm.post(this.params.product.url,data);
            // this.showEditBtns();
        }
    }
