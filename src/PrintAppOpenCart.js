/* PrintAppClient */// Created

  class PrintAppOpenCart extends PrintAppClient {
      constructor(params) {
          super(params);
          this.params = params;
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

      async _resetProject(e) {
         e.preventDefault();
        const data = { productId: this.params.product.id, clear : true };
        await this.comm.post(this.params.product.url, data);
        window.location.reload()
        
      }

      createInput(optId) {
          const node = document.createElement('input');
          node.setAttribute('type', 'hidden');
          node.setAttribute('id', `input-option${optId}`);
          node.setAttribute('name', `option[${optId}]`);
          document.querySelector(this.params.commandSelector).insertAdjacentElement('afterend', node);
          return node;
      }

      async saveProject(e) {
          const pa_values = encodeURIComponent(JSON.stringify(e.data));

          let input = document.querySelector(`#input-option${this.params.paOptionId}`);
          if (!input)
              input = this.createInput(this.params.paOptionId);
          input.value = pa_values;

          const data = { pa_values };
          await this.comm.post(this.params.product.url,data);


      }
  }
