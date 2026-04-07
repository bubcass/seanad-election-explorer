export default {
  title: "Elections Explorer",
  head: `
    <link rel="icon" href="logo.png" type="image/png" sizes="32x32">
    <script>
      document.documentElement.lang = "en-IE";

      const viewport = document.querySelector('meta[name="viewport"]');
      if (viewport) {
        viewport.setAttribute("content", "width=device-width, initial-scale=1");
      } else {
        const meta = document.createElement("meta");
        meta.name = "viewport";
        meta.content = "width=device-width, initial-scale=1";
        document.head.appendChild(meta);
      }
    </script>
  `,
  root: "src",
  style: "style.css",
  theme: null,
  sidebar: false,
  toc: false,
  pager: false,
  footer: "© Houses of the Oireachtas",
};
