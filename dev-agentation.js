(async function () {
  const params = new URLSearchParams(window.location.search);
  const enabled = params.get("agentation") === "1";

  if (!enabled) {
    return;
  }

  const mount = document.createElement("div");
  mount.id = "astir-agentation";
  document.body.appendChild(mount);

  try {
    const React = await import("https://esm.sh/react@18.3.1");
    const ReactDOM = await import("https://esm.sh/react-dom@18.3.1/client");
    const { Agentation } = await import("https://esm.sh/agentation@3.0.2?external=react,react-dom");

    ReactDOM.createRoot(mount).render(
      React.createElement(Agentation, {
        endpoint: "http://localhost:4747",
        copyToClipboard: true
      })
    );
  } catch (error) {
    console.error("Agentation failed to load", error);
  }
})();
