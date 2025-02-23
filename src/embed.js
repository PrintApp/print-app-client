
if (typeof this.PrintAppEmbed === 'undefined') {
    
    window.PrintAppEmbed = class {
        static NAME = 'print.app.embed';
        static VERSION = '0.1';
        static STORAGEKEY = 'printapp:embed';
        static ENDPOINTS = {
			cdnBase: 'https://editor.print.app/',
            runCdn: 'https://run.print.app/',
        };
        static SELECTORS = { };
        handlers = { };

        constructor(params) {
            this.model = {
                ui: { commands: { } },
                env: { },
                state: {
                    shown: false
                },
                act: {
                    pipe: {}
                },
                session: {},
                lang: {},
                langCode: 'en',
                isMobile: window.innerWidth < 1024,
                ...params
            };

            if (!this.model.hostname) throw new Error('This script needs to be loaded via wire');

            document.addEventListener('DOMContentLoaded', this.init.bind(this));
			this.init();
        }
        
        async init() {
			if (this.model?.act?.uiCreated || this.model?.act?.loading) return;

			this.model.act.loading = true;
			const embData = await fetch(`${window.PrintAppEmbed.ENDPOINTS.runCdn}embed/${this.model.id}`)
                            .then(d => d.json())
                            .catch(console.log);
			this.model.act.loading = false;

			if (!embData) return console.error('Failed to load embed data');
            this.model.env = embData;
            this.createUi();
        }

        async createUi() {
            if (this.model.act.uiCreated) return;
			
			let hostElement = window.PrintAppEmbed.runQuery(this.model.env.host);
			if (!hostElement) hostElement = window.PrintAppEmbed.runQuery('[print-app-embed-host]');
			if (!hostElement) return console.error('No host element found in page');
			this.model.ui.host = hostElement;
			window.PrintAppEmbed.loadStyling();
			await Promise.all([
				window.PrintAppEmbed.loadTag(`https://editor.print.app/js/petite-vue.js`),
				window.PrintAppEmbed.loadTag(`https://editor.print.app/js/client.js`),
			]);

			const htmlString = `
				<div id="printapp-embed-container" class="printapp-embed" v-scope>
					<div @click="click" class="printapp-embed-items">
						<div class="printapp-embed-item" v-for="design in designs" :key="design.id" data-cmd="launch" :data-design-id="design.id" >
							<div v-if="display?.includes('preview')" :style="{ backgroundImage: 'url(' + design.thumbnails[0] + ')' }" data-cmd="launch" :data-design-id="design.id" class="embed-preview"></div>
							<button v-if="display?.includes('button')" :style="{ backgroundColor: buttonColor }" data-cmd="launch" :data-design-id="design.id" class="button">
								<span :style="{ color: buttonTextColor }">{{ buttonText }}</span>
							</button>
						</div>
					</div>
				</div>
			`;
			this.model.ui.host.insertAdjacentHTML('beforeend', htmlString);
			this.model.ui.vue = window.PetiteVue.reactive({
				click: this.click.bind(this),
				...this.model.env
			});
			window.PetiteVue.createApp(this.model.ui.vue).mount(this.model.ui.host);

			this.model.act.uiCreated = true;
		}

		click(event) {
			switch (event.target?.dataset?.cmd) {
				case 'launch':
					if (event.target.dataset?.designId)
						this.launchDesign(event.target.dataset.designId);
				break;
			}
		}

		launchDesign(designId) {
			this.model.instance?.destroyApp?.();

			this.model.instance = new window.PrintAppClient({
				designId,
                domainKey: this.model.env.domainKey,
				langCode: this.model.langCode,
                framework: 'embed',
                mode: 'new-project',
				isEmbed: true,
				autoShow: true,
			});

			this.model.instance.addEventListener('app:saved', this.projectSaved.bind(this));
		}

		projectSaved(event) {
			if (this.model.env.onSave && typeof window[this.model.env.onSave] === 'function') {
				window[this.model.env.onSave](event?.data || event);
			}
		}

		static runQuery (queryString, element = document) {
			try {
				return element.querySelector(queryString);
			} catch (e) {	
				return null;
			}
		}

        static parse(string) {
			if (!string) return;
			try {
				let data = JSON.parse(string);
				return data || string;
			} catch (e) {  }
		}

        static loadStyling() {
			const tag = document.createElement('link');
			tag.setAttribute('rel', 'stylesheet');
			tag.href = `${window.PrintAppEmbed.ENDPOINTS.cdnBase}css/embed.css`;
			document?.head?.appendChild?.(tag);
		}
		static async loadTag(url, attrs = {}) {
			return new Promise((resolve) => {
				var tag;
				if (url.endsWith('.css')) {
					tag = document.createElement('link');
					tag.rel = 'stylesheet';
					if (document.head) document.head.appendChild(tag);
					tag.href = url;
				} else if (url.endsWith('.js')) {
					tag = document.createElement('script');
					if (document.head) document.head.appendChild(tag)
					for (let attr in attrs) tag.setAttribute(attr, attrs[attr]);
					tag.src = url
				}
				tag.onload = resolve;
			})
		}
    }
}

(function(global) {
    if (!global.PrintAppEmbedInstance) {
        const tag = [...document.getElementsByTagName('script')].find(s => s?.src?.includes('print.app/js/embed.js'));
        
        const params = {
            ...tag?.dataset || {},
            hostname: window.location.hostname,
            langCode: document.querySelector('html').getAttribute('lang') || 'en',
        };

        global.PrintAppEmbedInstance = new window.PrintAppEmbed(params);
    }

})(this);