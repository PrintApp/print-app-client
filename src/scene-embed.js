/**
 * Print.App 3D embeds: a saved view of a 3D Scene on any web page.
 *
 *   <div data-printapp-3d="view3d_…" style="width:100%;aspect-ratio:1/1"></div>
 *   <script src="https://editor.print.app/js/scene-embed.js" async></script>
 *
 * data-background="transparent" (or a hex colour) on the element overrides
 * the embed's background, so one embed can sit on differently coloured pages.
 *
 * Every element with data-printapp-3d (also ones added later) gets the
 * embed the admin saved in the Scene Studio: the scene, its sample art, the
 * camera it opens on and its display options. Visitors can turn it around;
 * nothing can be changed. The embed's still shows while the viewer loads,
 * and stays when the browser can't show 3D.
 *
 * The iframe code (editor.print.app/3d.html?e=…) is this script on a page of
 * its own.
 */
(function (global) {
	if (global.PrintApp3D) return;

	const CDN = 'https://d3f4dd8gq49w54.cloudfront.net/';
	const VIEWER = 'https://editor.print.app/js/scene-viewer.js';
	const ATTRIBUTION = 'https://print.app/features/3d-preview?utm_source=embed&utm_medium=3d-preview';
	const ID = /^view3d_[A-Za-z0-9]{10,40}$/;
	const mounted = new WeakMap();

	let viewer = null;
	const loadViewer = () => {
		if (global.FilecheckStage) return Promise.resolve(global.FilecheckStage);
		return (viewer ??= new Promise((resolve, reject) => {
			const tag = document.createElement('script');
			tag.async = true;
			tag.src = VIEWER;
			tag.onload = () => resolve(global.FilecheckStage);
			tag.onerror = () => { viewer = null; reject(new Error('3D viewer failed to load')); };
			(document.head || document.body).appendChild(tag);
		}));
	};

	const webgl = () => {
		try {
			const c = document.createElement('canvas');
			return !!(c.getContext('webgl2') || c.getContext('webgl'));
		} catch (e) { return false; }
	};

	// Saved embeds change rarely; a five-minute window keeps edits showing
	// soon while the CDN still serves almost every view.
	const fetchEmbed = async (id) => {
		const res = await fetch(`${CDN}scenes/embeds/${id}.json?v=${Math.floor(Date.now() / 3e5)}`);
		if (!res.ok) throw new Error(`embed ${id} not found`);
		return res.json();
	};

	const css = (el, styles) => Object.assign(el.style, styles);

	const poster = (box, embed) => {
		if (!embed.poster?.url) return null;
		const img = document.createElement('img');
		img.src = embed.poster.url;
		img.alt = embed.title || '';
		css(img, { position: 'absolute', inset: '0', width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' });
		box.appendChild(img);
		return img;
	};

	const attribution = (box) => {
		const a = document.createElement('a');
		a.href = ATTRIBUTION;
		a.target = '_blank';
		a.rel = 'noopener';
		a.textContent = 'Powered by Print.App';
		css(a, {
			position: 'absolute', right: '10px', bottom: '10px', zIndex: '2',
			font: '500 11px/1 system-ui, sans-serif', color: '#374151', textDecoration: 'none',
			padding: '5px 9px', borderRadius: '999px', background: 'rgba(255,255,255,.8)', border: '1px solid rgba(17,24,39,.08)',
		});
		box.appendChild(a);
	};

	async function mount(el) {
		if (mounted.has(el)) return;
		const id = el.getAttribute('data-printapp-3d');
		if (!ID.test(id || '')) return;
		mounted.set(el, null);

		const position = getComputedStyle(el).position;
		if (position === 'static') el.style.position = 'relative';
		// No height of its own: square, like an image would be. Not for a box
		// that takes its size from its insets (the iframe page's full-window
		// one), which reads 0 while its frame is still hidden.
		if (!el.clientHeight && position !== 'fixed' && position !== 'absolute') css(el, { aspectRatio: el.style.aspectRatio || '1 / 1' });

		let embed;
		try {
			embed = await fetchEmbed(id);
		} catch (e) {
			console.warn('[print.app] 3D embed:', e.message);
			return;
		}
		const still = poster(el, embed);
		if (embed.options?.attribution !== false) attribution(el);
		if (!webgl()) return;   // the still stays

		try {
			const stage = await loadViewer();
			const box = document.createElement('div');
			css(box, { position: 'absolute', inset: '0' });
			el.appendChild(box);
			const own = el.getAttribute('data-background');
			const bg = own && (own === 'transparent' || /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(own)) ? own : embed.options?.background;
			const handle = stage.mountScenePreview(box, {
				spec: embed.spec,
				artworkMm: embed.artworkMm,
				pages: embed.pages || [],
				page: embed.page || 1,
				cameraState: embed.camera,
				autoSpin: embed.options?.autoSpin !== false,
				views: embed.options?.views !== false,
				background: bg && bg !== 'scene' ? bg : undefined,
				title: embed.title || '3D preview',
				ui: true,
			});
			mounted.set(el, handle);
			handle.on('ready', () => still?.remove());
			handle.on('failed', () => { handle.dispose(); box.remove(); });
		} catch (e) {
			console.warn('[print.app] 3D embed:', e.message);
		}
	}

	const scan = (root = document) => root.querySelectorAll?.('[data-printapp-3d]').forEach(mount);

	global.PrintApp3D = { mount, scan };

	const start = () => {
		scan();
		// Page builders and themes add content after load.
		new MutationObserver(list => {
			for (const m of list) for (const n of m.addedNodes) {
				if (n.nodeType !== 1) continue;
				if (n.hasAttribute?.('data-printapp-3d')) mount(n);
				scan(n);
			}
		}).observe(document.documentElement, { childList: true, subtree: true });
	};
	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
	else start();
})(typeof window !== 'undefined' ? window : globalThis);
