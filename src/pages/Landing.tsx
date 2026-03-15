import { useEffect } from "react";
import { Link } from "react-router-dom";

const Landing = () => {
  useEffect(() => {
    // Google Fonts
    const link = document.createElement("link");
    link.href =
      "https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@300;400;600;700;800&family=IBM+Plex+Mono:wght@300;400;500&family=Barlow:wght@300;400;500;600&display=swap";
    link.rel = "stylesheet";
    document.head.appendChild(link);

    // FIBER CANVAS
    const cv = document.getElementById("dn-canvas") as HTMLCanvasElement;
    if (!cv) return;
    const cx = cv.getContext("2d")!;

    function rsz() {
      cv.width = window.innerWidth;
      cv.height = window.innerHeight;
    }
    rsz();
    window.addEventListener("resize", rsz);

    type Fiber = {
      x: number; y: number; vx: number; vy: number;
      h: { x: number; y: number }[]; maxH: number;
      hue: number; w: number; alp: number; c: number;
    };

    const fibers: Fiber[] = [];

    function mk(): Fiber {
      const s = Math.floor(Math.random() * 4);
      let x = 0, y = 0, a = 0;
      if (s === 0) { x = Math.random() * cv.width; y = 0; a = 0.3 + Math.random() * 0.55; }
      else if (s === 1) { x = cv.width; y = Math.random() * cv.height; a = Math.PI + 0.1 + Math.random() * 0.3; }
      else if (s === 2) { x = Math.random() * cv.width; y = cv.height; a = -0.3 - Math.random() * 0.55; }
      else { x = 0; y = Math.random() * cv.height; a = -0.15 + Math.random() * 0.3; }
      return {
        x, y,
        vx: Math.cos(a) * (0.6 + Math.random() * 1.1),
        vy: Math.sin(a) * (0.6 + Math.random() * 1.1),
        h: [], maxH: 70 + Math.floor(Math.random() * 65),
        hue: Math.random() > 0.4 ? 168 : 145 + Math.random() * 30,
        w: 0.5 + Math.random() * 1.1, alp: 0.38 + Math.random() * 0.45,
        c: (Math.random() - 0.5) * 0.018,
      };
    }

    for (let i = 0; i < 20; i++) {
      const f = mk();
      f.h = Array.from({ length: Math.floor(Math.random() * 40) }, (_, j) => ({
        x: f.x - f.vx * (40 - j), y: f.y - f.vy * (40 - j),
      }));
      fibers.push(f);
    }

    let raf: number;
    function draw() {
      cx.clearRect(0, 0, cv.width, cv.height);
      const t = Date.now() * 0.0001;
      fibers.forEach((f, i) => {
        f.vx += Math.cos(f.c + t) * 0.007;
        f.vy += Math.sin(f.c + t) * 0.007;
        f.x += f.vx; f.y += f.vy;
        f.h.push({ x: f.x, y: f.y });
        if (f.h.length > f.maxH) f.h.shift();
        if (f.h.length > 2) {
          for (let j = 1; j < f.h.length; j++) {
            const p = j / f.h.length;
            cx.beginPath();
            cx.moveTo(f.h[j - 1].x, f.h[j - 1].y);
            cx.lineTo(f.h[j].x, f.h[j].y);
            cx.strokeStyle = `hsla(${f.hue},82%,58%,${p * f.alp})`;
            cx.lineWidth = f.w * p;
            cx.stroke();
          }
          const tp = f.h[f.h.length - 1];
          const g = cx.createRadialGradient(tp.x, tp.y, 0, tp.x, tp.y, 7);
          g.addColorStop(0, `hsla(${f.hue},90%,66%,0.85)`);
          g.addColorStop(1, "transparent");
          cx.beginPath(); cx.arc(tp.x, tp.y, 7, 0, Math.PI * 2);
          cx.fillStyle = g; cx.fill();
        }
        if (f.x < -120 || f.x > cv.width + 120 || f.y < -120 || f.y > cv.height + 120) {
          Object.assign(fibers[i], mk());
        }
      });
      raf = requestAnimationFrame(draw);
    }
    draw();

    // SCROLL REVEAL
    const obs = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add("dn-vis"); }),
      { threshold: 0.1 }
    );
    document.querySelectorAll(".dn-rev").forEach((el) => obs.observe(el));

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", rsz);
      obs.disconnect();
      if (link.parentNode) link.parentNode.removeChild(link);
    };
  }, []);

  return (
    <>
      <style>{`
        .dn-root {
          --bg: #080f0f; --bg2: #0b1717; --card: #0f1e1e;
          --teal: #00c9b1; --green: #3ddc84; --amber: #f5a623; --blue: #2e7fff;
          --border: rgba(0,201,177,0.13); --text: #dff5f2; --muted: #4a6a6a;
          --grad: linear-gradient(135deg,#00c9b1,#3ddc84);
          --grad2: linear-gradient(135deg,#00e0c5,#4ef096);
        }
        .dn-root * { margin:0; padding:0; box-sizing:border-box; }
        .dn-root { background:var(--bg); color:var(--text); font-family:'Barlow',sans-serif; overflow-x:hidden; scroll-behavior:smooth; }

        #dn-canvas { position:fixed; top:0; left:0; width:100%; height:100%; pointer-events:none; z-index:0; opacity:0.38; }
        .dn-glow { position:fixed; top:-180px; left:50%; transform:translateX(-50%); width:650px; height:380px; background:radial-gradient(ellipse,rgba(0,201,177,0.07) 0%,transparent 70%); pointer-events:none; z-index:0; }

        /* NAV */
        .dn-nav { position:fixed; top:0; left:0; right:0; z-index:100; display:flex; align-items:center; justify-content:space-between; padding:1.1rem 2.5rem; background:rgba(8,15,15,0.9); backdrop-filter:blur(14px); border-bottom:1px solid var(--border); }
        .dn-nl { display:flex; align-items:center; gap:0.7rem; text-decoration:none; }
        .dn-nb { font-family:'Barlow Condensed',sans-serif; font-weight:800; font-size:1.2rem; color:#fff; letter-spacing:0.04em; }
        .dn-nb span { background:var(--grad); -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; }
        .dn-navlinks { display:flex; align-items:center; gap:1.75rem; list-style:none; }
        .dn-navlinks a { color:var(--muted); text-decoration:none; font-size:0.875rem; font-weight:500; transition:color 0.2s; }
        .dn-navlinks a:hover { color:var(--teal); }
        .dn-ncta { background:var(--grad) !important; color:#081212 !important; padding:0.5rem 1.3rem; border-radius:7px; font-weight:700 !important; font-size:0.85rem !important; box-shadow:0 0 18px rgba(0,201,177,0.3); transition:all 0.2s !important; }
        .dn-ncta:hover { box-shadow:0 0 32px rgba(0,201,177,0.55) !important; transform:translateY(-1px); }

        /* HERO */
        .dn-hero { position:relative; z-index:1; min-height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:8rem 2rem 5rem; }
        .dn-badge { display:inline-flex; align-items:center; gap:0.5rem; background:rgba(0,201,177,0.07); border:1px solid rgba(0,201,177,0.22); border-radius:100px; padding:0.35rem 1rem; font-family:'IBM Plex Mono',monospace; font-size:0.68rem; color:var(--teal); letter-spacing:0.12em; text-transform:uppercase; margin-bottom:1.75rem; animation:dn-fadeUp 0.7s ease both; }
        .dn-dot { width:6px; height:6px; border-radius:50%; background:var(--teal); box-shadow:0 0 8px var(--teal); animation:dn-pulse 2s infinite; }
        @keyframes dn-pulse { 0%,100%{opacity:1} 50%{opacity:0.2} }
        .dn-hero-logo { width:118px; height:118px; margin:0 auto 1.75rem; animation:dn-fadeUp 0.7s 0.06s ease both; filter:drop-shadow(0 0 32px rgba(0,201,177,0.45)); }
        .dn-h1 { font-family:'Barlow Condensed',sans-serif; font-weight:800; font-size:clamp(2.8rem,7.5vw,6.2rem); line-height:0.94; color:#fff; max-width:880px; animation:dn-fadeUp 0.7s 0.12s ease both; }
        .dn-h1 .dn-g { background:var(--grad); -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; }
        .dn-hsub { font-size:1.1rem; color:#6a9090; max-width:540px; line-height:1.75; margin:1.75rem auto 2.5rem; font-weight:300; animation:dn-fadeUp 0.7s 0.2s ease both; }
        .dn-hact { display:flex; align-items:center; gap:1rem; flex-wrap:wrap; justify-content:center; animation:dn-fadeUp 0.7s 0.28s ease both; }
        .dn-bp { background:var(--grad); color:#081212; padding:0.9rem 2.2rem; border-radius:9px; font-weight:700; font-size:0.95rem; text-decoration:none; box-shadow:0 0 28px rgba(0,201,177,0.35); transition:all 0.25s; }
        .dn-bp:hover { background:var(--grad2); transform:translateY(-2px); box-shadow:0 0 44px rgba(0,201,177,0.55); }
        .dn-ba { color:var(--amber); padding:0.9rem 2.2rem; border-radius:9px; font-weight:600; font-size:0.95rem; text-decoration:none; border:1.5px dashed var(--amber); background:rgba(245,166,35,0.06); transition:all 0.25s; }
        .dn-ba:hover { background:rgba(245,166,35,0.12); box-shadow:0 0 24px rgba(245,166,35,0.2); }
        .dn-hstats { display:flex; gap:3rem; margin-top:4rem; flex-wrap:wrap; justify-content:center; animation:dn-fadeUp 0.7s 0.36s ease both; }
        .dn-snum { font-family:'Barlow Condensed',sans-serif; font-size:2.4rem; font-weight:800; color:#fff; line-height:1; }
        .dn-snum span { color:var(--teal); }
        .dn-slbl { font-size:0.71rem; color:var(--muted); margin-top:0.25rem; letter-spacing:0.06em; text-transform:uppercase; }
        .dn-scroll-hint { position:absolute; bottom:2.5rem; left:50%; transform:translateX(-50%); display:flex; flex-direction:column; align-items:center; gap:0.5rem; color:#1f3535; font-family:'IBM Plex Mono',monospace; font-size:0.6rem; letter-spacing:0.15em; text-transform:uppercase; animation:dn-fadeUp 1s 0.8s both; }
        .dn-sl { width:1px; height:42px; background:linear-gradient(to bottom,var(--teal),transparent); animation:dn-sa 2.2s infinite; }
        @keyframes dn-sa { 0%{opacity:0;transform:scaleY(0);transform-origin:top} 50%{opacity:1;transform:scaleY(1)} 100%{opacity:0;transform:scaleY(1);transform-origin:bottom} }

        /* STRIP */
        .dn-strip { position:relative; z-index:1; padding:1.875rem 2rem; text-align:center; border-top:1px solid var(--border); border-bottom:1px solid var(--border); background:rgba(0,201,177,0.018); }
        .dn-slabel { font-family:'IBM Plex Mono',monospace; font-size:0.63rem; letter-spacing:0.15em; text-transform:uppercase; color:var(--muted); margin-bottom:1.25rem; }
        .dn-srow { display:flex; align-items:center; justify-content:center; gap:2.5rem; flex-wrap:wrap; }
        .dn-chip { font-family:'Barlow Condensed',sans-serif; font-weight:700; font-size:0.95rem; letter-spacing:0.1em; text-transform:uppercase; color:#1f3535; transition:color 0.2s; }
        .dn-chip:hover { color:var(--teal); }

        /* SECTIONS */
        .dn-sec { position:relative; z-index:1; padding:5.5rem 2rem; max-width:1160px; margin:0 auto; }
        .dn-sec-lbl { font-family:'IBM Plex Mono',monospace; font-size:0.63rem; letter-spacing:0.2em; text-transform:uppercase; color:var(--teal); margin-bottom:0.65rem; }
        .dn-sec-title { font-family:'Barlow Condensed',sans-serif; font-size:clamp(1.9rem,4vw,2.9rem); font-weight:800; color:#fff; line-height:1.1; margin-bottom:0.9rem; }
        .dn-sec-desc { color:var(--muted); font-size:0.95rem; max-width:500px; line-height:1.75; font-weight:300; }

        /* PILLARS */
        .dn-pillars { display:grid; grid-template-columns:repeat(auto-fit,minmax(250px,1fr)); gap:1.25rem; margin-top:3rem; }
        .dn-pc { background:var(--card); border:1px solid var(--border); border-radius:16px; padding:1.875rem; transition:all 0.3s; position:relative; overflow:hidden; }
        .dn-pc::after { content:''; position:absolute; top:0; left:0; right:0; height:2px; background:var(--grad); opacity:0; transition:opacity 0.3s; }
        .dn-pc:hover { border-color:rgba(0,201,177,0.3); transform:translateY(-4px); }
        .dn-pc:hover::after { opacity:1; }
        .dn-pico { width:46px; height:46px; border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:1.4rem; margin-bottom:1.1rem; background:rgba(0,201,177,0.08); }
        .dn-pc h3 { font-family:'Barlow Condensed',sans-serif; font-size:1.2rem; font-weight:700; color:#fff; margin-bottom:0.65rem; }
        .dn-pc p { color:var(--muted); font-size:0.845rem; line-height:1.7; }
        .dn-pfeats { margin-top:1.1rem; display:flex; flex-direction:column; gap:0.45rem; }
        .dn-pf { display:flex; align-items:center; gap:0.45rem; font-size:0.78rem; color:#2a4545; }
        .dn-pf::before { content:'→'; color:var(--teal); font-size:0.68rem; }

        /* BENTO */
        .dn-bento { display:grid; grid-template-columns:repeat(3,1fr); gap:1.1rem; margin-top:3rem; }
        .dn-bc { background:var(--card); border:1px solid var(--border); border-radius:16px; padding:1.625rem; transition:all 0.25s; }
        .dn-bc:hover { border-color:rgba(0,201,177,0.22); }
        .dn-bc.dn-s2 { grid-column:span 2; }
        .dn-bi { font-size:1.7rem; margin-bottom:0.875rem; }
        .dn-bc h4 { font-family:'Barlow Condensed',sans-serif; font-size:1.05rem; font-weight:700; color:#fff; margin-bottom:0.45rem; }
        .dn-bc p { color:#2e4a4a; font-size:0.815rem; line-height:1.65; }
        .dn-btag { display:inline-block; margin-top:0.875rem; font-family:'IBM Plex Mono',monospace; font-size:0.62rem; letter-spacing:0.1em; text-transform:uppercase; color:var(--teal); background:rgba(0,201,177,0.07); border:1px solid rgba(0,201,177,0.18); padding:0.22rem 0.6rem; border-radius:4px; }

        /* PRICING */
        .dn-pwrap { display:flex; justify-content:center; margin-top:3rem; }
        .dn-pcard { background:linear-gradient(145deg,rgba(0,201,177,0.06),rgba(61,220,132,0.03)); border:1px solid rgba(0,201,177,0.28); border-radius:24px; padding:3rem; width:100%; max-width:540px; box-shadow:0 0 70px rgba(0,201,177,0.1); position:relative; overflow:hidden; text-align:center; }
        .dn-pcard::before { content:''; position:absolute; top:0; left:0; right:0; height:2px; background:var(--grad); }
        .dn-pbadge { display:inline-flex; align-items:center; gap:0.4rem; background:rgba(0,201,177,0.09); border:1px solid rgba(0,201,177,0.22); border-radius:100px; padding:0.35rem 1rem; font-family:'IBM Plex Mono',monospace; font-size:0.65rem; color:var(--teal); letter-spacing:0.12em; text-transform:uppercase; margin-bottom:1.75rem; }
        .dn-plan-n { font-family:'Barlow Condensed',sans-serif; font-size:0.85rem; font-weight:600; letter-spacing:0.2em; text-transform:uppercase; color:var(--muted); margin-bottom:0.5rem; }
        .dn-pnum { font-family:'Barlow Condensed',sans-serif; font-size:5.5rem; font-weight:800; line-height:1; background:var(--grad); -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; }
        .dn-pper { font-size:1.05rem; font-weight:400; color:var(--muted); font-family:'Barlow',sans-serif; display:block; margin-top:0.25rem; }
        .dn-pdesc { color:#527070; font-size:0.9rem; margin:1.25rem auto 2rem; line-height:1.7; max-width:400px; }
        .dn-pcta { display:block; text-align:center; padding:1rem 2rem; border-radius:10px; font-weight:700; font-size:1rem; text-decoration:none; background:var(--grad); color:#081212; box-shadow:0 0 32px rgba(0,201,177,0.35); transition:all 0.25s; margin-bottom:2.5rem; }
        .dn-pcta:hover { background:var(--grad2); transform:translateY(-2px); box-shadow:0 0 50px rgba(0,201,177,0.5); }
        .dn-pdiv { height:1px; background:var(--border); margin-bottom:2rem; }
        .dn-pfeats-list { list-style:none; display:grid; grid-template-columns:1fr 1fr; gap:0.875rem; text-align:left; }
        .dn-pfeats-list li { display:flex; align-items:flex-start; gap:0.5rem; font-size:0.845rem; color:#7a9e9e; line-height:1.5; }
        .dn-pfeats-list li::before { content:'✓'; color:var(--teal); font-weight:700; flex-shrink:0; }
        .dn-pnote { margin-top:1.75rem; font-family:'IBM Plex Mono',monospace; font-size:0.65rem; color:#1f3535; letter-spacing:0.07em; }

        /* CTA */
        .dn-ctasec { position:relative; z-index:1; padding:5rem 2rem; text-align:center; background:linear-gradient(180deg,transparent,rgba(0,201,177,0.03),transparent); border-top:1px solid var(--border); border-bottom:1px solid var(--border); }
        .dn-ctasec h2 { font-family:'Barlow Condensed',sans-serif; font-size:clamp(2rem,5vw,3.5rem); font-weight:800; color:#fff; margin-bottom:1rem; }
        .dn-ctasec p { color:var(--muted); font-size:1rem; max-width:460px; margin:0 auto 2.5rem; line-height:1.75; }
        .dn-cbtns { display:flex; gap:1rem; justify-content:center; flex-wrap:wrap; }

        /* FOOTER */
        .dn-footer { position:relative; z-index:1; padding:2.5rem; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:1rem; border-top:1px solid var(--border); }
        .dn-flogo { display:flex; align-items:center; gap:0.6rem; text-decoration:none; }
        .dn-flt { font-family:'Barlow Condensed',sans-serif; font-weight:700; font-size:1rem; color:#1f3535; letter-spacing:0.04em; }
        .dn-flinks { display:flex; gap:1.5rem; }
        .dn-flinks a { font-size:0.8rem; color:#1f3535; text-decoration:none; transition:color 0.2s; }
        .dn-flinks a:hover { color:var(--teal); }

        /* DIVIDER */
        .dn-hdiv { position:relative; z-index:1; height:1px; background:linear-gradient(90deg,transparent,var(--border),transparent); }

        /* ANIMATIONS */
        @keyframes dn-fadeUp { from{opacity:0;transform:translateY(22px)} to{opacity:1;transform:translateY(0)} }
        .dn-rev { opacity:0; transform:translateY(28px); transition:opacity 0.6s ease,transform 0.6s ease; }
        .dn-rev.dn-vis { opacity:1; transform:translateY(0); }
        .dn-d1 { transition-delay:0.1s } .dn-d2 { transition-delay:0.2s } .dn-d3 { transition-delay:0.3s }

        @media(max-width:768px){
          .dn-nav { padding:1rem 1.25rem; }
          .dn-navlinks { display:none; }
          .dn-bento { grid-template-columns:1fr; }
          .dn-bc.dn-s2 { grid-column:span 1; }
          .dn-pfeats-list { grid-template-columns:1fr; }
          .dn-sec { padding:4rem 1.25rem; }
          .dn-footer { flex-direction:column; text-align:center; }
        }
      `}</style>

      <div className="dn-root">
        <canvas id="dn-canvas"></canvas>
        <div className="dn-glow"></div>

        {/* NAV */}
        <nav className="dn-nav">
          <a href="#" className="dn-nl">
            <img src="/assets/delta-icon-glossy.png" alt="Delta Network" style={{width:'32px',height:'32px',objectFit:'contain'}} />
            <span className="dn-nb">DELTA<span>NETWORK</span></span>
          </a>
          <div className="dn-navlinks">
            <a href="#features">Λειτουργίες</a>
            <a href="#pricing">Τιμές</a>
            <a href="mailto:info@deltanetwork.app">Επικοινωνία</a>
            <Link to="/login" className="dn-ncta">Σύνδεση →</Link>
          </div>
        </nav>

        {/* HERO */}
        <section className="dn-hero">
          <div className="dn-badge">
            <span className="dn-dot"></span>FTTx Operations Platform
          </div>
          <img src="/assets/delta-icon-glossy.png" alt="Delta Network" className="dn-hero-logo" />
          <h1 className="dn-h1">
            Η FTTx δουλειά σου.<br /><span className="dn-g">Ψηφιακή. Οργανωμένη.</span>
          </h1>
          <p className="dn-hsub">
            Από το AS-BUILD ως την παράδοση στον ΟΤΕ — όλη η ροή σε μία πλατφόρμα. Για τεχνικούς στο πεδίο και managers στο γραφείο.
          </p>
          <div className="dn-hact">
            <a href="mailto:info@deltanetwork.app" className="dn-bp">Ζητήστε Demo →</a>
            <Link to="/demo" className="dn-ba">▷ Δοκιμαστική Λειτουργία</Link>
          </div>
          <div className="dn-hstats">
            <div>
              <div className="dn-snum">100<span>%</span></div>
              <div className="dn-slbl">Αυτοματοποίηση AS-BUILD</div>
            </div>
            <div>
              <div className="dn-snum">0<span>€</span></div>
              <div className="dn-slbl">Κόστος εγκατάστασης</div>
            </div>
            <div>
              <div className="dn-snum">4<span>×</span></div>
              <div className="dn-slbl">Ταχύτερη παράδοση SR</div>
            </div>
          </div>
          <div className="dn-scroll-hint">
            <div className="dn-sl"></div>
            scroll
          </div>
        </section>

        {/* STRIP */}
        <section className="dn-strip">
          <div className="dn-slabel">Σχεδιασμένο για εργολάβους που δουλεύουν με</div>
          <div className="dn-srow">
            {["ΟΤΕ / COSMOTE","FTTH","FTTB","FTTC","GIS / ΧΕΜΔ","AS-BUILD"].map(c => (
              <span className="dn-chip" key={c}>{c}</span>
            ))}
          </div>
        </section>

        {/* PILLARS */}
        <section className="dn-sec" id="features">
          <div className="dn-rev">
            <div className="dn-sec-lbl">Τέσσερις Πυλώνες</div>
            <div className="dn-sec-title">Όλη η ροή εργασίας<br />σε ένα εργαλείο</div>
            <p className="dn-sec-desc">Από την ανάθεση ως την παράδοση — χωρίς Excel, χωρίς χαρτιά, χωρίς καθυστερήσεις.</p>
          </div>
          <div className="dn-pillars">
            {[
              { icon:"📋", title:"Back Office & AS-BUILD", desc:"Αυτόματη δημιουργία AS-BUILD Excel και ZIP παράδοσης ΟΤΕ από τα δεδομένα του πεδίου.", feats:["Excel AS-BUILD με 1 κλικ","ZIP φωτογραφιών ανά κατηγορία","Αυτόματος τιμοκατάλογος ΟΤΕ"], delay:"dn-d1" },
              { icon:"🔒", title:"Stage-Gate Έλεγχος", desc:"Κανένας τεχνικός δεν προχωρά χωρίς να ολοκληρώσει το προηγούμενο στάδιο.", feats:["Pre-work checklist","Αυτοψία → Κατασκευή → Παράδοση","Supervisor override με αιτιολόγηση"], delay:"dn-d2" },
              { icon:"🤖", title:"AI Vision Επικύρωση", desc:"Τεχνητή νοημοσύνη ελέγχει αυτόματα κάθε φωτογραφία πριν αποθηκευτεί.", feats:["Ανίχνευση λάθος κατηγορίας","Ποιοτικός έλεγχος φωτογραφίας","Watermark GPS + timestamp"], delay:"dn-d3" },
              { icon:"📱", title:"Εργονομία Τεχνικού", desc:"Mobile-first εφαρμογή που δουλεύει και offline. Χωρίς χαρτιά, χωρίς τηλεφωνήματα.", feats:["Offline λειτουργία & sync","Live GPS χάρτης αναθέσεων","Push notifications νέων εντολών"], delay:"" },
            ].map(p => (
              <div className={`dn-pc dn-rev ${p.delay}`} key={p.title}>
                <div className="dn-pico">{p.icon}</div>
                <h3>{p.title}</h3>
                <p>{p.desc}</p>
                <div className="dn-pfeats">
                  {p.feats.map(f => <div className="dn-pf" key={f}>{f}</div>)}
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="dn-hdiv"></div>

        {/* BENTO */}
        <section className="dn-sec">
          <div className="dn-rev">
            <div className="dn-sec-lbl">Λεπτομέρειες</div>
            <div className="dn-sec-title">Κάθε λεπτομέρεια<br />έχει σκεφτεί</div>
          </div>
          <div className="dn-bento">
            <div className="dn-bc dn-s2 dn-rev">
              <div className="dn-bi">🗺️</div>
              <h4>Live Χάρτης Τεχνικών</h4>
              <p>Δείτε σε πραγματικό χρόνο πού βρίσκεται κάθε τεχνικός. Ενημέρωση κάθε 30 δευτερόλεπτα, ταξινόμηση κατά απόσταση, άμεση πλοήγηση Google Maps.</p>
              <span className="dn-btag">Realtime GPS</span>
            </div>
            <div className="dn-bc dn-rev">
              <div className="dn-bi">📦</div>
              <h4>Αποθήκη Υλικών</h4>
              <p>Stock υλικών ΟΤΕ και ιδιόκτητων. Ειδοποιήσεις χαμηλού αποθέματος.</p>
              <span className="dn-btag">Stock Alerts</span>
            </div>
            <div className="dn-bc dn-rev">
              <div className="dn-bi">🔗</div>
              <h4>Σύνδεση με ΧΕΜΔ</h4>
              <p>Άμεσο άνοιγμα του broadband-assist.gov.gr στο ακριβές σημείο κτιρίου.</p>
              <span className="dn-btag">Deep Link GPS</span>
            </div>
            <div className="dn-bc dn-rev">
              <div className="dn-bi">📊</div>
              <h4>KPIs & Τζίρος</h4>
              <p>Τζίρος ανά τεχνικό, κερδοφορία ανά SR, σύγκριση εβδομάδων.</p>
            </div>
            <div className="dn-bc dn-rev">
              <div className="dn-bi">🏢</div>
              <h4>Multi-tenant</h4>
              <p>Κάθε εταιρία έχει δικά της δεδομένα. Πλήρης ασφάλεια και απομόνωση.</p>
              <span className="dn-btag">Data Isolation</span>
            </div>
            <div className="dn-bc dn-rev">
              <div className="dn-bi">⚡</div>
              <h4>Setup σε 5 Λεπτά</h4>
              <p>Wizard εγκατάστασης: Google Drive, τεχνικοί, τιμοκατάλογος ΟΤΕ.</p>
            </div>
          </div>
        </section>

        <div className="dn-hdiv"></div>

        {/* PRICING */}
        <section className="dn-sec" id="pricing">
          <div className="dn-rev">
            <div className="dn-sec-lbl">Τιμολόγηση</div>
            <div className="dn-sec-title">Ένα πλάνο.<br />Όλες οι λειτουργίες.</div>
            <p className="dn-sec-desc">Χωρίς κρυφές χρεώσεις. Χωρίς εκπλήξεις.</p>
          </div>
          <div className="dn-pwrap">
            <div className="dn-pcard dn-rev">
              <div className="dn-pbadge">✦ Πλήρες Πακέτο</div>
              <div className="dn-plan-n">FTTx Operations</div>
              <div className="dn-pnum">600</div>
              <span className="dn-pper">€ / μήνα · ανά εταιρία</span>
              <p className="dn-pdesc">Απεριόριστοι τεχνικοί, όλες οι λειτουργίες, setup & υποστήριξη. Ό,τι χρειάζεστε για να δουλεύετε επαγγελματικά.</p>
              <a href="mailto:info@deltanetwork.app" className="dn-pcta">Ζητήστε Demo →</a>
              <div className="dn-pdiv"></div>
              <ul className="dn-pfeats-list">
                {["Απεριόριστοι τεχνικοί","AS-BUILD αυτοματοποίηση","Stage-Gate έλεγχος","AI Vision φωτογραφιών","Live GPS χάρτης","Offline λειτουργία","Push notifications","Αποθήκη υλικών","KPIs & Analytics","Google Drive σύνδεση","Σύνδεση ΧΕΜΔ","Setup & υποστήριξη"].map(f => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              <div className="dn-pnote">✦ Δεν απαιτείται χρεωστική κάρτα για το demo</div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="dn-ctasec">
          <div className="dn-rev">
            <h2>Έτοιμοι να ξεκινήσετε;</h2>
            <p>Ζητήστε demo και δείτε πώς το DeltaNetwork αλλάζει τον τρόπο που δουλεύετε. Εγκατάσταση σε 5 λεπτά.</p>
            <div className="dn-cbtns">
              <a href="mailto:info@deltanetwork.app" className="dn-bp">Ζητήστε Demo →</a>
              <Link to="/demo" className="dn-ba">▷ Δοκιμαστική Λειτουργία</Link>
            </div>
          </div>
        </section>

        {/* FOOTER */}
        <footer className="dn-footer">
          <a href="#" className="dn-flogo">
            <img src="/assets/delta-icon-glossy.png" alt="Delta Network" style={{width:'24px',height:'24px',objectFit:'contain'}} />
            <span className="dn-flt">DELTANETWORK</span>
          </a>
          <div className="dn-flinks">
            <a href="/login" style={{color:'var(--teal)',fontWeight:600}}>Σύνδεση</a>
            <Link to="/terms" style={{color:'inherit'}}>Όροι Χρήσης</Link>
            <a href="mailto:info@deltanetwork.app">info@deltanetwork.app</a>
          </div>
          <div style={{marginTop:'16px',fontSize:'11px',color:'rgba(255,255,255,0.35)',textAlign:'center'}}>
            © {new Date().getFullYear()} DeltaNetwork. All rights reserved. Με επιφύλαξη παντός δικαιώματος.<br/>
            Απαγορεύεται η αντιγραφή, αναπαραγωγή ή μεταπώληση χωρίς γραπτή άδεια.
          </div>
        </footer>
      </div>
    </>
  );
};

export default Landing;
