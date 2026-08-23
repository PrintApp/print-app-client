// Dependencies: PrintAppClient

if (typeof this.PrintAppShopify === 'undefined') {
    
    this.PrintAppShopify = class {
        static NAME = 'print-app-shopify';
        static VERSION = '0.1';
        static STORAGEKEY = 'print-app-sp';
        static PROJECTSKEY = 'print-app-sp-projects';
        static ENDPOINTS = {
            baseCdn: 'https://editor.print.app/',
            runCdn: 'https://run.print.app/',
            pdf: 'https://pdf.print.app/',
        };

        static SELECTORS = {
            previews: '.product__media-wrapper,.image,#product-photo-container,.product-left-column,.main-image,.product-photo-container,.featured,#image-block,.product-single-photos,.product_slider,#product-image,.photos,.product-single__photos,.image__container,.product-gallery',
            cartForm: '[data-type="add-to-cart-form"],[action="/cart/add"],[action="/cart/add.js"],#add-item-form,#add-to-cart-form,[action$="/cart/add"], #AddToCartForm',
            cartDrawer: '#aov-cart-drawer,cart-drawer,cart-drawer-component,#cart-drawer,cart-notification,#CartDrawer,.cart-drawer,#mini-cart,.mini-cart,.minicart,.drawer--cart,#sidebar-cart,.cart-popup,.ajaxcart,#slidecarthq,.upcart-cart-body',
            drawerLineItem: '.cart-items__table-row,.AOV-CartDrawer-Item,[data-line-item-key],[data-cart-item-key],[data-cart-item],.cart-item,.cart__item,.cart-drawer-item,.mini-cart__item,.line-item,.ajaxcart__product',
        };
        model = { };

        constructor(params) {
            if (!params) return console.error(`Parameters required but "undefined" was passed`); 
            this.init(params);
        }
        
        async init(params) {
            this.model = { ...params };

            if (!this.model.hostname) return console.error('This script needs to be loaded via wire');

            if (this.model.accountPage) return this.doClientAccount();
            if (this.model.cartPage) {
                await this.setCartImages();
                // The floating drawer can be opened on the cart page too — keep it in sync.
                if (this._cartData?.items?.some(item => item?.properties?.['_printapp'])) this.armDrawerPreviews();
                return;
            }

            // Floating cart drawers / mini-carts re-render after ajax cart mutations,
            // so the one-shot cart-page replacement never reaches them. Only arm the
            // drawer watcher when this browser is known to hold Print.App projects
            // and a cart exists — product pages (re)arm in mountClient() once the
            // product's designs are confirmed.
            const savedProjects = window.PrintAppShopify.getStorage(window.PrintAppShopify.PROJECTSKEY);
            if (Object.keys(savedProjects || {}).length && /(?:^|;\s*)cart=/.test(document.cookie)) {
                this.armDrawerPreviews();
            }

            this.model.langCode = document.querySelector('html').getAttribute('lang') || 'en';
            let metaLangTag = document.querySelector('[name="language-code"]');
            if (metaLangTag) this.model.langCode = metaLangTag.getAttribute('content') || this.model.langCode;

            await this.getUser();
            window.addEventListener('DOMContentLoaded', () => this.check());
            this.check();
        }

        async check() {
            if (window.printappset) return;
            window.printappset = true;
            const paButtons = `<div id="pa-buttons"><img src="${window.PrintAppShopify.ENDPOINTS.baseCdn}assets/images/loader.svg" style="width:2rem"></div>`;

            const liquidForm = document.getElementById('print-app-shopify-mount');
            if (liquidForm?.dataset?.productId) {
                this.model.productId = liquidForm.dataset.productId;
                this.model.cartForm = liquidForm.closest('form') || 
                                        window.PrintAppShopify.queryPrioritySelector(window.PrintAppShopify.SELECTORS.cartForm, true);
                
                if (!this.model.cartForm || !this.model.productId) return;
                liquidForm.insertAdjacentHTML('afterbegin', paButtons);

            } else {
                this.model.cartForm = window.PrintAppShopify.queryPrioritySelector(window.PrintAppShopify.SELECTORS.cartForm, true);
                const productId = this.model.cartForm?.querySelector('input[name="product-id"]')?.value;
                if (productId) this.model.productId = productId;
                if (!this.model.cartForm || !this.model.productId) return;
                this.model.cartForm.insertAdjacentHTML('afterbegin', paButtons);

            }
            
            const paData = await fetch(`${window.PrintAppShopify.ENDPOINTS.runCdn}dom_sp_${this.model.storeId}/${this.model.productId}/sp?lang=${this.model.langCode}`)
                                .then(d => d.json()).catch(console.error);

            if (!paData) {
                document.getElementById('pa-buttons')?.remove();
                return;
            }

            if (!paData.designs?.length && !paData.artwork && !Object.keys(paData.variants || {}).length) {
                const sec = document.getElementById('pa-buttons');
                return sec?.remove?.();
            }
            this.model.designData = paData;
            this.mountClient();
        }

        async mountClient() {
            await window.PrintAppShopify.loadTag(`${window.PrintAppShopify.ENDPOINTS.baseCdn}js/client.js`);

            if (this.model.clientMounted || typeof PrintAppClient !== 'function') return;

            let titleTag = document.querySelector('[property="og:title"]');
            if (titleTag) this.model.title = titleTag.getAttribute('content');
            
            let store = window.PrintAppShopify.getStorage(window.PrintAppShopify.STORAGEKEY);
            let currentValue = store[this.model.productId] || {};
            if (!document.getElementById('_printapp')) {
                this.model.cartForm.insertAdjacentHTML('afterbegin', `
                    <input id="_printapp" name="properties[_printapp]" type="hidden" value="">
                    <input id="_printapp-pdf-download" name="properties[_printapp-pdf-download]" type="hidden" value="">
                `);
                this.setElementValue(currentValue.projectId || '');
            }

            let designList = this.model.designData?.designs || [];
            if (Object.keys(this.model.designData?.variants || {}).length) {
                designList = designList.concat(Object.values(this.model.designData.variants).flat())
            }

            this.model.instance = window.printAppInstance = new PrintAppClient({
                langCode: this.model.langCode,
                product: {
                    id: this.model.productId,
                    name: window.__st?.pageurl?.split('/').pop().split('-').join(' '),
                    title: this.model.title,
                    url: window.location.href
                },
                framework: 'sp',
                domainKey: `dom_sp_${this.model.storeId}`,
                storeId: this.model.storeId,
                designList,
                variants: this.model.designData?.variants,
                artwork: this.model.designData?.artwork,
                settings: this.model.designData?.settings,
                language: this.model.designData?.language,
                projectId: currentValue.projectId,
                previews: currentValue.previews,
                mode: currentValue.projectId ? 'edit-project' : 'new-project',
                commandSelector: '#pa-buttons',
                previewsSelector: window.PrintAppShopify.SELECTORS.previews,
            });
            
            this.model.clientMounted = true;
            this.model.instance.on('app:saved', data => this.projectSaved(data));
            this.model.instance.on('app:project:reset', data => this.clearProject(data));

            setTimeout(() => {
                if (currentValue.projectId) this.setAddToCartAction();
            }, 1e3);

            if (this.model.designData?.settings?.observeFormRerenders) {
                this.observeFormRerenders();
            }

            // This product is customizable — watch for floating-cart re-renders so
            // customized line items keep their project previews.
            if (!this.model.designData?.settings?.disableCartDrawerPreviews) {
                this.armDrawerPreviews();
            }

            window.PrintAppShopify.initCustomModifications();
        }

        // Some themes / variant calculators re-render the cart form on variant change,
        // which removes #pa-buttons and our hidden inputs. Watch for that and restore them.
        // Opt-in via designData.settings.observeFormRerenders to avoid impacting stores
        // that don't need it.
        observeFormRerenders() {
            if (this._formObserver) return;

            const restore = () => {
                // Already present — nothing to do (also breaks the self-trigger loop).
                if (document.getElementById('pa-buttons')) return;

                // Prefer the liquid mount point if the store uses it; otherwise re-locate
                // a cart form via the same priority selector used at first mount.
                const liquidForm = document.getElementById('print-app-shopify-mount');
                let target, newForm;
                if (liquidForm?.dataset?.productId) {
                    newForm = liquidForm.closest('form')
                        || window.PrintAppShopify.queryPrioritySelector(window.PrintAppShopify.SELECTORS.cartForm, true);
                    target = liquidForm;
                } else {
                    newForm = window.PrintAppShopify.queryPrioritySelector(window.PrintAppShopify.SELECTORS.cartForm, true);
                    target = newForm;
                }
                if (!newForm || !target) return;

                this.model.cartForm = newForm;

                // Re-inject the buttons mount point.
                target.insertAdjacentHTML('afterbegin', `<div id="pa-buttons"></div>`);

                // Re-inject the hidden inputs that carry the project id into the cart.
                if (!document.getElementById('_printapp')) {
                    newForm.insertAdjacentHTML('afterbegin', `
                        <input id="_printapp" name="properties[_printapp]" type="hidden" value="">
                        <input id="_printapp-pdf-download" name="properties[_printapp-pdf-download]" type="hidden" value="">
                    `);
                    const store = window.PrintAppShopify.getStorage(window.PrintAppShopify.STORAGEKEY);
                    this.setElementValue(store[this.model.productId]?.projectId || '');
                }

                // Re-mount the petite-vue command UI into the new #pa-buttons node.
                const instance = this.model.instance;
                if (instance?.createCommandUI) {
                    instance.model.ui.base = document.getElementById('pa-buttons');
                    // Re-resolve the cart button since it likely got replaced too.
                    const cartSelector = instance.model.env?.settings?.cartButtonSelector
                        || (window.PrintAppClient && window.PrintAppClient.SELECTORS?.cartButton);
                    if (cartSelector) {
                        instance.model.ui.cartButton = window.PrintAppShopify.queryPrioritySelector(cartSelector, true);
                    }
                    instance.createCommandUI();
                    // Re-attach the clear-on-add handler against the new cart button.
                    setTimeout(() => {
                        const stored = window.PrintAppShopify.getStorage(window.PrintAppShopify.STORAGEKEY)[this.model.productId]?.projectId;
                        if (this.model.currentProjectId || stored) this.setAddToCartAction();
                    }, 0);
                }
            };

            // Debounce so a burst of mutations triggers one restore.
            let scheduled = false;
            const schedule = () => {
                if (scheduled) return;
                scheduled = true;
                requestAnimationFrame(() => {
                    scheduled = false;
                    try { restore(); } catch (e) { console.error(e); }
                });
            };

            // Watch document.body for structural changes (additions/removals of children)
            this._formObserver = new MutationObserver(() => {
                if (!document.getElementById('pa-buttons')) {
                    schedule();
                }
            });
            this._formObserver.observe(document.body, { childList: true, subtree: true });
        }

        clearProject(value) {
            const   { projectId, keepInput } = value || {};
            const   store = window.PrintAppShopify.getStorage(window.PrintAppShopify.STORAGEKEY),
                    projects = window.PrintAppShopify.getStorage(window.PrintAppShopify.PROJECTSKEY);

            delete store[this.model.productId];
            delete projects[projectId || this.model.currentProjectId];
            
            window.localStorage.setItem(window.PrintAppShopify.STORAGEKEY, JSON.stringify(store));
            window.localStorage.setItem(window.PrintAppShopify.PROJECTSKEY, JSON.stringify(projects));
            
            if (!keepInput) this.setElementValue('');
            setTimeout(() => {
                window.location.reload();
            }, 3e3);
        }
        projectSaved(value) {
            const { data } = value;
            this.model.currentProjectId = data.projectId;
            
            const   store = window.PrintAppShopify.getStorage(window.PrintAppShopify.STORAGEKEY),
                    projects = window.PrintAppShopify.getStorage(window.PrintAppShopify.PROJECTSKEY);
                
            
            this.setElementValue(data.projectId);
            store[this.model.productId] = data;
            projects[data.projectId || this.model.currentProjectId] = data;

            window.localStorage.setItem(window.PrintAppShopify.STORAGEKEY, JSON.stringify(store));
            window.localStorage.setItem(window.PrintAppShopify.PROJECTSKEY, JSON.stringify(projects));

            this.setAddToCartAction();
        }
        setElementValue(value) {
            const   element = document.getElementById(`_printapp`),
                    pdfElement = document.getElementById(`_printapp-pdf-download`);

            if (element) element.value = value;
            if (pdfElement) pdfElement.value = value ? `${window.PrintAppShopify.ENDPOINTS.pdf}${value}` : '';
        }
        setAddToCartAction() {
			if (!this.model.instance || (this.model.instance?.model?.env?.settings?.displayMode === 'mini')) return;
            const   paInstance = this.model.instance,
                    cartButton = paInstance?.model?.ui?.cartButton;
            if (!cartButton) return;

            if (this._clearHandler) cartButton.removeEventListener('click', this._clearHandler);
            // A click is only an *attempt*: option apps (required checkboxes etc.)
            // can block the submit after the click fires. Clearing on the click
            // alone wipes the customer's design and reloads the page with nothing
            // added — so confirm the project actually landed in the cart first.
            this._clearHandler = () => this.confirmAddThenClear();
            cartButton.addEventListener('click', this._clearHandler);
	    }

        async confirmAddThenClear() {
            const projectId = this.model.currentProjectId
                || document.getElementById('_printapp')?.value
                || (window.PrintAppShopify.getStorage(window.PrintAppShopify.STORAGEKEY) || {})[this.model.productId]?.projectId;
            if (!projectId) return;
            if (this._confirmingAdd) return; // a confirmation loop is already polling
            this._confirmingAdd = true;

            const landed = async () => {
                const cart = await fetch('/cart.js').then(d => d.json()).catch(() => null);
                return !!cart?.items?.some(item => item?.properties?.['_printapp'] === projectId);
            };

            try {
                // Poll at ~1.2s / 2.7s / 5.2s after the click; a blocked or failed
                // add never confirms and the design is left untouched, so the
                // customer can fix the validation and simply click again.
                for (const wait of [1200, 1500, 2500]) {
                    await new Promise(resolve => setTimeout(resolve, wait));
                    if (await landed()) {
                        this.clearProject({ projectId, keepInput: true });
                        return;
                    }
                }
            } finally {
                this._confirmingAdd = false;
            }
        }

        doClientAccount() { }

        static initCustomModifications() {
            
            // Shoify BSS plugin fix...
            window.bssFixSupportUpdateFormatBody = function (store, requestBody) {
                if (!store || !requestBody?.items?.length) return requestBody;
                const   element = document.getElementById(`_printapp`),
                        pdfElement = document.getElementById(`_printapp-pdf-download`);

                if (element?.value && pdfElement?.value) {
                    requestBody.items[0].properties = {
                        ...requestBody.items[0].properties,
                        _printapp: element.value,
                        _printapp_pdf_download: pdfElement.value,
                    };

                    // window?.printAppPrintShopifyInstance?.projectSaved?.({ data: { clear: true }})
                }
                return requestBody;
            }
        }
        
        static getStorage(key) {
            let r = window.localStorage.getItem(key);
            if (typeof r === 'string') return window.PrintAppShopify.parse(r);
            return r || {};
        }

        async setCartImages() {
            const data = await fetch('/cart.js')
                        .then(d => d.json()).catch(console.log);
            if (!data?.items) return;
            this._cartData = data;
            if (!data.items.some(item => item?.properties?.['_printapp'])) return;

            // Identity-matched, non-destructive replacement — the same engine the
            // floating drawer uses. Only when it can't recognize any line-item row
            // does the legacy index-based replacement run, so old themes that
            // depend on it keep working.
            const applied = this.applyPreviewsInRoot(document, data.items);
            if (!applied) this.legacyCartImages(data.items);
        }

        // Legacy /cart replacement: pairs cart items with image containers by index
        // and replaces the container content. Kept as a fallback for themes whose
        // markup the row-based engine can't identify.
        legacyCartImages(items) {
            var imageSelector = '.line-item__image-wrapper > .aspect-ratio, .cart-line-image,.product_image,.cart_image,.product-image,.cpro_item_inner,.cart__image,.cart-image,.cart-item .image,.cart-item__image-container,.cart_page_image,.tt-cart__product_image,.CartItem__ImageWrapper,div.description.cf > a,.product-img, .cart-item-wrapper>.cart-item-block-left .cart-item-image img, .order-summary__body>tr>td>.line-item>.line-item__media-wrapper, .image-wrap>image-element>.image-element, .cart-item__media',
                images = document.querySelectorAll(imageSelector);

            items.forEach((item, index) => {
                if (item?.properties?.['_printapp']) {
                    const projectId = item.properties['_printapp'];
                    if (!/^[a-zA-Z0-9_-]+$/.test(projectId)) return;

                    const url = `${window.PrintAppShopify.ENDPOINTS.runCdn}preview/${encodeURIComponent(projectId)}`;
                    const div = document.createElement('div');
                    const newImg = document.createElement('img');
                    newImg.src = url;
                    newImg.width = 94;
                    newImg.style.cssText = 'margin: 5px; opacity: 1';
                    div.appendChild(newImg);
                    div.appendChild(document.createElement('br'));

                    let img = images[index];
                    if (img) {
                        const target = img.tagName === 'IMG' ? img.parentNode : img;
                        target.textContent = '';
                        target.appendChild(div);
                    }
                }
            });
        }

        // Arm floating-cart preview support: a passive watcher for cart mutations
        // plus an initial apply when a cart already exists. Idempotent; called
        // from mountClient() (designs confirmed) or, gated, from init().
        armDrawerPreviews() {
            if (this._drawerArmed) return;
            this._drawerArmed = true;

            this.watchCartMutations();
            const start = () => {
                this.attachDrawerObservers();
                if (/(?:^|;\s*)cart=/.test(document.cookie)) this.refreshDrawerPreviews();
            };
            if (document.readyState === 'loading') {
                window.addEventListener('DOMContentLoaded', start);
            } else start();
        }

        // Detect ajax cart mutations via PerformanceObserver resource timings —
        // the browser records every fetch/XHR there, so no patching of globals
        // and no risk of colliding with other scripts. Costs nothing until the
        // theme actually talks to the cart API.
        watchCartMutations() {
            if (this._cartPerfObserver || typeof PerformanceObserver !== 'function') return;

            const isCartMutation = (url) => {
                try {
                    const u = new URL(url, location.origin);
                    // Locale prefixes are possible (/en-fr/cart/add.js) — match on the tail.
                    if (/\/cart\/(add|change|update|clear)(\.js)?$/.test(u.pathname.replace(/\/+$/, ''))) return true;
                    // Section Rendering API refresh of a cart section (how Dawn updates its drawer).
                    const sections = u.searchParams.get('sections');
                    return !!(sections && /cart/i.test(sections));
                } catch { return false; }
            };

            try {
                this._cartPerfObserver = new PerformanceObserver(list => {
                    for (const entry of list.getEntries()) {
                        if (entry.initiatorType !== 'fetch' && entry.initiatorType !== 'xmlhttprequest') continue;
                        // responseStatus isn't exposed in every browser; when it is, skip failures.
                        if (entry.responseStatus && (entry.responseStatus < 200 || entry.responseStatus >= 300)) continue;
                        if (isCartMutation(entry.name)) return this.scheduleDrawerRefresh();
                    }
                });
                // buffered:true also catches cart requests that finished before we armed.
                this._cartPerfObserver.observe({ type: 'resource', buffered: true });
            } catch (e) { console.error(e); }
        }

        // Debounce bursts of cart requests into one /cart.js fetch.
        scheduleDrawerRefresh() {
            clearTimeout(this._drawerDebounce);
            this._drawerDebounce = setTimeout(() => this.refreshDrawerPreviews(), 200);
        }

        async refreshDrawerPreviews() {
            if (this.model.designData?.settings?.disableCartDrawerPreviews) return;

            const cart = await fetch('/cart.js').then(d => d.json()).catch(() => null);
            if (cart?.items) this._cartData = cart;
            if (!cart?.items?.some(item => item?.properties?.['_printapp'])) return;

            // The theme renders the drawer some time after the cart request resolves;
            // bounded retries absorb that latency (the swap is idempotent, so
            // re-running against an already-updated drawer is a no-op).
            if (this._drawerApplyTimers) this._drawerApplyTimers.forEach(clearTimeout);
            const run = () => {
                try {
                    this.applyDrawerPreviews(cart.items);
                    // Drawer roots can be injected late (app embeds) — (re)attach then.
                    this.attachDrawerObservers();
                } catch (e) { console.error(e); }
            };
            run();
            this._drawerApplyTimers = [300, 900, 2000].map(ms => setTimeout(run, ms));
        }

        // Some drawer apps (e.g. AOV) rebuild their line items from a template every
        // time the drawer opens — with no cart request to key off. Observe each
        // drawer ROOT (scoped — never document/body) for structural changes and
        // re-apply from the cached cart. Our swaps only touch img attributes, so
        // childList mutations can't self-trigger.
        attachDrawerObservers() {
            const settings = this.model.designData?.settings || {};
            const drawerSelector = settings.cartDrawerSelector || window.PrintAppShopify.SELECTORS.cartDrawer;

            let roots;
            try { roots = document.querySelectorAll(drawerSelector); } catch (e) { return console.error(e); }

            this._observedDrawerRoots ??= new WeakSet();
            roots.forEach(root => {
                if (this._observedDrawerRoots.has(root)) return;
                this._observedDrawerRoots.add(root);
                new MutationObserver(() => this.applyDrawerFromCache())
                    .observe(root, { childList: true, subtree: true });
            });
        }

        // Debounced re-apply from the last known cart — no network. A circuit
        // breaker backs off if a drawer app keeps fighting the swap.
        applyDrawerFromCache() {
            clearTimeout(this._drawerCacheDebounce);
            this._drawerCacheDebounce = setTimeout(() => {
                if (this.model.designData?.settings?.disableCartDrawerPreviews) return;
                const items = this._cartData?.items;
                if (!items?.some(item => item?.properties?.['_printapp'])) return;

                const now = Date.now();
                if (!this._applyWindowStart || now - this._applyWindowStart > 30e3) {
                    this._applyWindowStart = now;
                    this._applyCount = 0;
                }
                if (++this._applyCount > 20) return;

                try { this.applyDrawerPreviews(items); } catch (e) { console.error(e); }
            }, 150);
        }

        applyDrawerPreviews(items) {
            const settings = this.model.designData?.settings || {};
            const drawerSelector = settings.cartDrawerSelector || window.PrintAppShopify.SELECTORS.cartDrawer;

            let roots;
            try { roots = Array.from(document.querySelectorAll(drawerSelector)); } catch (e) { return console.error(e); }
            // The main cart page uses the same line-item engine — treat it as a root
            // so re-renders (quantity changes etc.) get previews re-applied too.
            if (this.model.cartPage) roots.push(document);

            let applied = 0;
            roots.forEach(root => applied += this.applyPreviewsInRoot(root, items));
            return applied;
        }

        // Apply previews to every recognizable line-item row inside one root.
        // Returns how many customized rows now show their project preview.
        applyPreviewsInRoot(root, items) {
            const settings = this.model.designData?.settings || {};
            const rowSelector = settings.drawerLineItemSelector || window.PrintAppShopify.SELECTORS.drawerLineItem;

            let all;
            try { all = Array.from(root.querySelectorAll(rowSelector)); } catch (e) { console.error(e); return 0; }
            // Keep only outermost matches — the selector list can hit both a row
            // and one of its descendants.
            const rows = all.filter(el => !all.some(other => other !== el && other.contains(el)));
            if (!rows.length) return 0;

            let applied = 0;
            const usedByVariant = {};
            rows.forEach((row, index) => {
                const item = this.resolveDrawerItem(row, index, rows, items, usedByVariant);
                if (!item) {
                    if (!this._drawerMatchWarned && rows.length !== items.length) {
                        this._drawerMatchWarned = true;
                        console.warn('PrintApp: could not match a cart line-item row to a cart item; skipping preview for it');
                    }
                    return;
                }
                if (this.setDrawerPreviewImage(row, item)) applied++;
            });
            return applied;
        }

        // Identify which cart item a drawer row represents: line-item key first,
        // then variant id, then plain index — but index only when the counts line
        // up, so a preview can never land on the wrong product.
        resolveDrawerItem(row, index, rows, items, usedByVariant) {
            const keyEl = row.matches('[data-line-item-key],[data-cart-item-key],[data-key]')
                ? row : row.querySelector('[data-line-item-key],[data-cart-item-key],[data-key]');
            const key = keyEl?.dataset?.lineItemKey || keyEl?.dataset?.cartItemKey || keyEl?.dataset?.key;
            if (key) return items.find(item => item.key === key);

            const changeLink = row.querySelector('a[href*="/cart/change"]');
            if (changeLink) {
                try {
                    const id = new URL(changeLink.getAttribute('href'), location.origin).searchParams.get('id');
                    if (id?.includes(':')) return items.find(item => item.key === id);
                } catch (_) {}
            }

            let variantId;
            const varEl = row.matches('[data-variant-id]') ? row : row.querySelector('[data-variant-id]');
            if (varEl?.dataset?.variantId) variantId = varEl.dataset.variantId;
            if (!variantId) {
                const varLink = row.querySelector('a[href*="variant="]');
                if (varLink) {
                    try {
                        variantId = new URL(varLink.getAttribute('href'), location.origin).searchParams.get('variant');
                    } catch (_) {}
                }
            }
            if (variantId) {
                // Same variant can appear on several lines (different customizations);
                // pair rows and items in document order.
                const matches = items.filter(item => String(item.variant_id) === String(variantId));
                const seen = usedByVariant[variantId] || 0;
                usedByVariant[variantId] = seen + 1;
                return matches[seen];
            }

            if (rows.length === items.length) return items[index];
            return null;
        }

        // Non-destructive swap: keep the theme's own <img> (layout, links, aspect
        // ratio), just point it at the project preview. Idempotent via data attrs.
        setDrawerPreviewImage(row, item) {
            const projectId = item?.properties?.['_printapp'];
            if (!projectId || !/^[a-zA-Z0-9_-]+$/.test(projectId)) return false;

            const img = row.querySelector('img');
            if (!img) return false;

            const url = `${window.PrintAppShopify.ENDPOINTS.runCdn}preview/${encodeURIComponent(projectId)}`;
            // Drawer apps can rewrite src after our swap (hydration/CDN normalization),
            // so "already applied" must check the live src, not just our marker —
            // otherwise the retries skip and the overwrite wins.
            if (img.dataset.paProject === projectId && img.getAttribute('src') === url) return true;

            if (!img.dataset.paOrigSrc) img.dataset.paOrigSrc = img.getAttribute('src') || '';
            img.dataset.paProject = projectId;
            img.onerror = () => {
                // Preview not generated (yet) — fall back to the original image and
                // let a later retry attempt the swap again.
                img.onerror = null;
                delete img.dataset.paProject;
                if (img.dataset.paOrigSrc) img.src = img.dataset.paOrigSrc;
            };
            img.removeAttribute('srcset');
            img.removeAttribute('sizes');
            img.src = url;
            return true;
        }

        static async loadTag(url) {
            if (document.querySelector(`script[src="${url}"]`) || document.querySelector(`link[href="${url}"]`)) return;
            return new Promise((resolve) => {
                var tag;
                if (url.endsWith('.css')) {
                    tag = document.createElement('link');
                    tag.rel = 'stylesheet';
                    if (document.head) document.head.appendChild(tag);
                    tag.href = url;
                } else if (url.endsWith('.js')) {
                    tag = document.createElement('script');
                    if (document.head) document.head.appendChild(tag);
                    tag.src = url;
                }
                tag.onload = resolve;
                tag.onerror = resolve;
            });
        }
        async getUser() {
            // TODO.. get user data details
            this.model.userData = {
                id: window.__st.cid,
            };
        }

        static parse(string) {
            if (!string) return;
            try {
                return JSON.parse(string);
            } catch (e) { console.error(e) }
        }

        static queryPrioritySelector(selectors, visible) {
            const list = (typeof selectors === 'string') ? selectors.split(',') : selectors;
            let firstAvailable = null; // Store the first available element if no visible elements are found
            for (let selector of list) {
                const elements = document.querySelectorAll(selector);
                for (let element of elements) {
                    // Check if the element is in the document flow
                    if (element?.offsetParent) {
                        // If we're not specifically looking for a visible element, return the first one found
                        if (!visible) return element;
        
                        // Check if the element is "visible" by checking its dimensions
                        if (element?.offsetWidth > 0 && element?.offsetHeight > 0) {
                            return element; // Return the first element that is visible
                        }
        
                        // Keep the first encountered element in case no visible elements are found
                        if (!firstAvailable) firstAvailable = element;
                    }
                }
            }
            // Return the first available element if no visible element was found
            return firstAvailable;
        }
    }
}

(function(global) {
    if (!global.printAppPrintShopifyInstance) {
        const params = {
                productPage: window.location.pathname.includes('/products'),
                cartPage: window.location.pathname.includes('/cart'),
                accountPage: window.location.pathname.includes('/account'),
                hostname: window.location.hostname,
                storeId: window.Shopify.shop,
                productId: window.__st.rid,
            };
        global.printAppPrintShopifyInstance ??= new PrintAppShopify(params);
    }
})(globalThis);