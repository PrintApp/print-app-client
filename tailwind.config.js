/** @type {import('tailwindcss').Config} */

module.exports = {
	content: ["./src/*.{html,js}", "./sample/*.{html,js}"],
	theme: {
		extend: {},
	},
	plugins: [],
}
// npx tailwindcss -i ./input.css -o ./styles.css --watch