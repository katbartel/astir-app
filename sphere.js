(function () {
  const rootStyles = getComputedStyle(document.documentElement);
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function token(name) {
    return rootStyles.getPropertyValue(name).trim();
  }

  function hexToRgb(hex) {
    const clean = hex.replace("#", "");
    const value = parseInt(clean, 16);
    return {
      r: (value >> 16) & 255,
      g: (value >> 8) & 255,
      b: value & 255
    };
  }

  function rgba(hex, alpha) {
    const rgb = hexToRgb(hex);
    return `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`;
  }

  function createAstirSphere(canvas) {
    const ctx = canvas.getContext("2d");
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const size = parseInt(token("--sphere-size"), 10);
    const center = (size / 2) * dpr;
    const radius = 74 * dpr;
    const colors = {
      gold: token("--sphere-gold"),
      rest: token("--sphere-rest"),
      prep: token("--sphere-prep")
    };

    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;

    function sprite(color) {
      const spriteSize = 16 * dpr;
      const spriteCanvas = document.createElement("canvas");
      const spriteCtx = spriteCanvas.getContext("2d");
      const gradient = spriteCtx.createRadialGradient(spriteSize / 2, spriteSize / 2, 0, spriteSize / 2, spriteSize / 2, spriteSize / 2);

      spriteCanvas.width = spriteSize;
      spriteCanvas.height = spriteSize;
      gradient.addColorStop(0, color);
      gradient.addColorStop(.35, `${color}CC`);
      gradient.addColorStop(1, `${color}00`);
      spriteCtx.fillStyle = gradient;
      spriteCtx.fillRect(0, 0, spriteSize, spriteSize);
      return spriteCanvas;
    }

    const sprites = {
      gold: sprite(colors.gold),
      rest: sprite(colors.rest),
      prep: sprite(colors.prep)
    };
    const particles = [];
    const particleTotal = reducedMotion ? 420 : 1200;

    for (let i = 0; i < particleTotal; i += 1) {
      particles.push({
        theta: Math.random() * Math.PI * 2,
        phi: Math.acos(2 * Math.random() - 1),
        radiusShare: .55 + Math.random() * .45,
        offsetA: Math.random() * 6.28,
        offsetB: Math.random() * 6.28,
        offsetC: Math.random() * 6.28,
        size: .55 + Math.random() * .7,
        kind: "gold",
        switchAt: 0,
        nextKind: "gold"
      });
    }

    let pace = 1;
    let glow = 1;
    let flare = 0;
    let flareBig = 0;
    let lastFrame = 0;

    function wash(kind, share) {
      const now = performance.now();
      particles.forEach((particle) => {
        const target = Math.random() < share ? kind : "gold";
        particle.nextKind = target;
        particle.switchAt = now + Math.random() * 2600;
      });
    }

    function frame(timestamp) {
      const delta = Math.min(.05, (timestamp - lastFrame) / 1000) || .016;
      const time = timestamp * .001;
      const speed = pace * (1 + flare * 2 + flareBig * 1.6);

      lastFrame = timestamp;
      flare = Math.max(0, flare - delta * .85);
      flareBig = Math.max(0, flareBig - delta * .45);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const activeGlow = glow + flare * .5 + flareBig * .9;
      const halo = ctx.createRadialGradient(center, center, radius * .2, center, center, radius * 2.1);
      halo.addColorStop(0, rgba(token("--gold"), .14 * activeGlow));
      halo.addColorStop(1, rgba(token("--gold"), 0));
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const scale = 1 + flareBig * .1 + flare * .04;
      const visible = [];

      for (const particle of particles) {
        if (particle.switchAt && timestamp > particle.switchAt) {
          particle.kind = particle.nextKind;
          particle.switchAt = 0;
        }

        if (!reducedMotion) {
          const thetaDelta = (Math.sin(particle.phi * 2.1 + time * .5 + particle.offsetA) * .5 + Math.sin(particle.phi * 3.7 - time * .31 + particle.offsetB) * .3 + .25) * delta * .55 * speed;
          const phiDelta = (Math.sin(particle.theta * 1.8 + time * .37 + particle.offsetC) * .5 + Math.cos(particle.theta * 2.6 - time * .22 + particle.offsetA) * .3) * delta * .34 * speed;
          particle.theta += thetaDelta;
          particle.phi += phiDelta;
        }

        particle.phi = Math.max(.05, Math.min(3.09, particle.phi));
        const wobble = reducedMotion ? 1 : 1 + Math.sin(time * .7 + particle.offsetB) * .05;
        const activeRadius = radius * particle.radiusShare * wobble * scale;
        const sinPhi = Math.sin(particle.phi);
        const x = Math.cos(particle.theta) * sinPhi;
        const z = Math.sin(particle.theta) * sinPhi;
        const y = Math.cos(particle.phi);
        visible.push({
          x: center + x * activeRadius,
          y: center + y * activeRadius,
          z: z * particle.radiusShare,
          particle
        });
      }

      visible.sort((a, b) => a.z - b.z);
      for (const item of visible) {
        const depth = (item.z + 1) / 2;
        const spriteSize = item.particle.size * (.45 + depth * .85) * (4.4 * dpr) * (1 + flareBig * .25);
        ctx.globalAlpha = Math.min(1, (.06 + depth * .82) * activeGlow);
        ctx.drawImage(sprites[item.particle.kind], item.x - spriteSize / 2, item.y - spriteSize / 2, spriteSize, spriteSize);
      }
      ctx.globalAlpha = 1;

      if (!reducedMotion) {
        requestAnimationFrame(frame);
      }
    }

    requestAnimationFrame(frame);

    return {
      markPrep() {
        wash("prep", .45);
        pace = .8;
        glow = 1;
      },
      markRest() {
        wash("rest", .45);
        pace = .55;
        glow = .85;
      },
      markApplication() {
        wash("gold", 0);
        pace = 1;
        glow = 1;
        flare = 1;
      },
      celebrateResponse() {
        wash("gold", 0);
        pace = 1;
        glow = 1;
        flareBig = 1;
      }
    };
  }

  window.AstirSphere = {
    create: createAstirSphere
  };
})();
