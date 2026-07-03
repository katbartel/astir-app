(function () {
  const params = new URLSearchParams(window.location.search);
  const enabled = params.get("agentation") === "1";

  if (!enabled) {
    return;
  }

  const script = document.createElement("script");
  script.src = "https://unpkg.com/agentation-wc";
  script.async = true;
  script.onload = function () {
    if (!document.querySelector("agentation-tool")) {
      document.body.appendChild(document.createElement("agentation-tool"));
    }
  };

  document.head.appendChild(script);
})();
