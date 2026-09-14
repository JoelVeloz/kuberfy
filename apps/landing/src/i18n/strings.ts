export type Locale = "en" | "es" | "pt-BR";
export const LOCALE_PATHS: Record<Locale, string> = { en: "/", es: "/es/", "pt-BR": "/pt-br/" };

export interface HomeStrings {
  nav: {
    comparison: string;
    benchmarks: string;
    features: string;
    architecture: string;
    quickstart: string;
    docs: string;
    installBtn: string;
  };
  hero: {
    badge: string;
    titleLine1: string;
    titleEmber: string;
    subtitle: string;
    installNote: string;
    copy: string;
    copied: string;
    viewDocs: string;
    githubStars: string;
    requirements: string;
  };
  mockup: {
    urlBar: string;
    screenshotPlaceholder: string;
    screenshotAlt: string;
  };
  benchmarks: {
    heading: string;
    body: string;
    stats: Array<{ value: string; label: string; sub: string }>;
    note: string;
  };
  comparison: {
    heading: string;
    body: string;
    tableHeaderFeature: string;
    tableHeaderTypical: string;
    tableHeaderKuberfy: string;
    rows: Array<{ feature: string; typical: string; kuberfy: string }>;
  };
  features: {
    heading: string;
    body: string;
    items: Array<{ title: string; body: string; tag: string }>;
  };
  architecture: {
    heading: string;
    body: string;
    step1Title: string;
    step1Desc: string;
    step2Title: string;
    step2Desc: string;
    step3Title: string;
    step3Desc: string;
    step4Title: string;
    step4Desc: string;
    resilienceNote: string;
  };
  quickstart: {
    heading: string;
    body: string;
    tabInstall: string;
    tabUpdate: string;
    tabUninstall: string;
    requirementsTitle: string;
    requirements: string[];
    copyCmd: string;
  };
  faq: {
    heading: string;
    body: string;
    items: Array<{ question: string; answer: string }>;
  };
  cta: {
    heading: string;
    subtitle: string;
    button: string;
    note: string;
  };
  footer: {
    tagline: string;
    github: string;
    documentation: string;
    issues: string;
    license: string;
    copyright: string;
  };
}

export const strings: Record<Locale, HomeStrings> = {
  en: {
    nav: {
      comparison: "Why Kuberfy",
      benchmarks: "Benchmarks",
      features: "Features",
      architecture: "Architecture",
      quickstart: "Install",
      docs: "Docs",
      installBtn: "Get Started",
    },
    hero: {
      badge: "Measured Idle RAM: ~23 MB • Zero External Databases",
      titleLine1: "Deploy your apps on your own server.",
      titleEmber: "Without burning your RAM.",
      subtitle:
        "Kuberfy is an ultra-lightweight self-hosted PaaS: a single compiled binary, an embedded SQLite database, and Traefik for automatic HTTPS. No PostgreSQL to babysit, no Redis to justify.",
      installNote: "Run on a fresh Ubuntu or Debian server with root access.",
      copy: "Copy",
      copied: "Copied!",
      viewDocs: "Documentation",
      githubStars: "Star on GitHub",
      requirements: "Confirmed on 1 vCPU / 1 GB RAM ($3–$5/mo VPS) • x86_64 & ARM64",
    },
    mockup: {
      urlBar: "dashboard.yourdomain.com",
      screenshotPlaceholder: "Dashboard screenshot coming soon",
      screenshotAlt: "Kuberfy dashboard showing running applications, deploy logs, and domains",
    },
    benchmarks: {
      heading: "Measured on real hardware, not marketing specs",
      body: "These numbers come from docker stats on clean VMs — verified end-to-end through full installation on the smallest instance sizes available.",
      stats: [
        { value: "23 MB", label: "Kuberfy Control Plane", sub: "API, web UI, and SQLite reader" },
        { value: "14 MB", label: "Traefik Edge Proxy", sub: "Automatic Let's Encrypt TLS termination" },
        { value: "1 vCPU / 1 GB", label: "Confirmed Minimum VPS", sub: "Installs and deploys with zero OOM errors" },
        { value: "< 60s", label: "One-Command Install", sub: "Provisions Docker, Swarm, Traefik & Kuberfy" },
      ],
      note: "The remaining memory on your server is completely free for your actual applications, not eaten up by the management dashboard.",
    },
    comparison: {
      heading: "Why Kuberfy leaves the competition behind on small servers",
      body: "Most self-hosted platforms bundle an entire PostgreSQL server, a Redis instance, and an interpreted runtime just to manage a handful of containers. Here is how Kuberfy compares directly with other popular self-hosted platforms:",
      tableHeaderFeature: "Architecture & Footprint",
      tableHeaderTypical: "Typical PaaS (Coolify / Dokploy)",
      tableHeaderKuberfy: "Kuberfy",
      rows: [
        {
          feature: "Internal Database",
          typical: "PostgreSQL container (~150–300 MB idle RAM) requiring manual backups and migrations",
          kuberfy: "Embedded SQLite: single file, zero server processes, zero RAM overhead",
        },
        {
          feature: "Control Plane Runtime",
          typical: "Interpreted Node.js / Python running continuously",
          kuberfy: "Compiled static binary (via Bun) — instant boot, minimal memory footprint",
        },
        {
          feature: "Extra Services",
          typical: "Redis cache, queue daemons, WebSocket bridges (Soketi)",
          kuberfy: "None — a single lightweight process handles API, UI, and database",
        },
        {
          feature: "Idle Memory Overhead",
          typical: "500 MB – 1.5 GB RAM consumed before deploying any user apps",
          kuberfy: "~37 MB total (Kuberfy + Traefik combined)",
        },
        {
          feature: "Minimum Hardware",
          typical: "2 GB RAM required; 4 GB strongly recommended",
          kuberfy: "1 GB RAM confirmed working under real workloads",
        },
        {
          feature: "TLS & Routing",
          typical: "Manual certbot scripts or complex reverse proxy stacks",
          kuberfy: "Traefik with automated Let's Encrypt renewal out of the box",
        },
      ],
    },
    features: {
      heading: "Everything you need to ship, nothing you don't",
      body: "A clean, reliable deployment loop built for production — without unnecessary bloat.",
      items: [
        {
          title: "Deploy from Git or Container Images",
          body: "Point Kuberfy to a GitHub/GitLab repository with a Dockerfile, or pull pre-built images from Docker Hub and GHCR.",
          tag: "Git & Registry",
        },
        {
          title: "36 One-Click App Templates",
          body: "Deploy Gitea, Vaultwarden, n8n, and 33 other open-source apps with secrets generated and volumes wired up automatically.",
          tag: "Marketplace",
        },
        {
          title: "Automatic HTTPS & Custom Domains",
          body: "Attach your custom domain and Traefik negotiates SSL certificates with Let's Encrypt automatically. Zero manual Nginx configuration.",
          tag: "Traefik + ACME",
        },
        {
          title: "Ultra-Lightweight Control Plane",
          body: "Compiled into a single binary running alongside SQLite. Boot time is under a second and it leaves your server resources for your apps.",
          tag: "Bun + SQLite",
        },
        {
          title: "Live Build & Deployment Logs",
          body: "Watch build outputs and runtime container logs stream in real-time right from your dashboard. A failed build is never a mystery.",
          tag: "Live Logs",
        },
        {
          title: "Projects, Secrets & Environment Variables",
          body: "Group related services under isolated projects. Manage environment variables securely with encrypted storage.",
          tag: "Project Isolation",
        },
        {
          title: "Multi-Architecture: x86_64 & ARM64",
          body: "Official multi-arch container images. Runs smoothly on Raspberry Pi, Hetzner ARM, AWS Graviton, and Oracle Cloud Free Tier.",
          tag: "Multi-Arch",
        },
      ],
    },
    architecture: {
      heading: "Simple, bulletproof architecture",
      body: "No fragile interconnected microservices. Three distinct layers designed so your user applications never suffer downtime even if the management panel restarts.",
      step1Title: "1. Internet Traffic",
      step1Desc: "Client HTTPS/HTTP requests enter via standard ports 80 and 443.",
      step2Title: "2. Traefik Edge",
      step2Desc: "Terminates TLS, auto-renews Let's Encrypt certificates, and routes directly to app containers.",
      step3Title: "3. Kuberfy Core",
      step3Desc: "A ~23 MB compiled binary reading an embedded SQLite file. Communicates with the Docker socket.",
      step4Title: "4. Docker Swarm Engine",
      step4Desc: "Runs your application containers on isolated internal overlay networks.",
      resilienceNote:
        "High availability principle: If Kuberfy is updated or restarted, Traefik continues routing traffic directly to your containers without dropped requests.",
    },
    quickstart: {
      heading: "Get up and running in 60 seconds",
      body: "Run the single-line command on your Linux server. Kuberfy configures Docker, Swarm, Traefik, and starts the panel automatically.",
      tabInstall: "Install",
      tabUpdate: "Update",
      tabUninstall: "Uninstall",
      requirementsTitle: "Server Prerequisites",
      requirements: [
        "Fresh Ubuntu 22.04 / 24.04 or Debian 12 server",
        "1 vCPU, 1 GB RAM, 10 GB free disk space",
        "Root shell access (or sudo)",
        "Ports 80 and 443 accessible from the internet",
      ],
      copyCmd: "Copy Command",
    },
    faq: {
      heading: "Frequently Asked Questions",
      body: "Clear, straightforward answers about how Kuberfy works.",
      items: [
        {
          question: "Why does Kuberfy use SQLite instead of PostgreSQL?",
          answer:
            "For a single-server deployment platform managing dozens or even hundreds of containers, SQLite provides sub-millisecond query times and zero RAM overhead. PostgreSQL would consume 150–300 MB of RAM just sitting idle. Backing up Kuberfy is as simple as copying a single `.sqlite` file.",
        },
        {
          question: "Do my apps go down if the Kuberfy panel is restarted or updated?",
          answer:
            "No. Traefik and Docker Swarm maintain all application routing and container lifecycles independently. Kuberfy only orchestrates state — if the Kuberfy container stops, your applications continue serving incoming traffic seamlessly.",
        },
        {
          question: "Does Kuberfy support ARM servers like Oracle Free Tier or Raspberry Pi?",
          answer:
            "Yes! The official Kuberfy Docker image is built with multi-arch manifests supporting both amd64 (x86_64) and arm64. It works out-of-the-box on AWS Graviton, Hetzner ARM, Apple Silicon (dev), and Oracle Cloud ARM instances.",
        },
        {
          question: "Is Kuberfy open-source and free to use?",
          answer:
            "Yes, Kuberfy is open source and licensed under BUSL 1.1. You can freely inspect the code on GitHub, self-host it on your own servers, and use it for personal and commercial projects.",
        },
      ],
    },
    cta: {
      heading: "Ready to reclaim your server's memory?",
      subtitle: "Install Kuberfy in under a minute and start deploying without platform bloat.",
      button: "Install Kuberfy Now",
      note: "No credit card required. Free and open source.",
    },
    footer: {
      tagline: "Ultra-lightweight self-hosted PaaS. Single binary. Embedded database.",
      github: "GitHub Repository",
      documentation: "Documentation",
      issues: "Report an Issue",
      license: "BUSL 1.1 License",
      copyright: "© 2026 Kuberfy. Built for developers.",
    },
  },
  es: {
    nav: {
      comparison: "Por qué Kuberfy",
      benchmarks: "Rendimiento",
      features: "Funciones",
      architecture: "Arquitectura",
      quickstart: "Instalar",
      docs: "Docs",
      installBtn: "Comenzar",
    },
    hero: {
      badge: "Consumo medido: ~23 MB RAM • 0 bases de datos externas",
      titleLine1: "Despliega tus proyectos en tu propio VPS.",
      titleEmber: "Sin devorarte la memoria.",
      subtitle:
        "Kuberfy es un PaaS autoalojado ultraliviano: un único binario compilado, base de datos SQLite embebida y Traefik para HTTPS automático. Sin PostgreSQL que mantener ni Redis que justificar.",
      installNote: "Ejecútalo en un servidor limpio con Ubuntu o Debian y acceso root.",
      copy: "Copiar",
      copied: "¡Copiado!",
      viewDocs: "Documentación",
      githubStars: "Ver en GitHub",
      requirements: "Confirmado en 1 vCPU / 1 GB RAM (VPS de $3–$5/mes) • x86_64 y ARM64",
    },
    mockup: {
      urlBar: "dashboard.tudominio.com",
      screenshotPlaceholder: "Captura del panel próximamente",
      screenshotAlt: "Panel de Kuberfy mostrando aplicaciones activas, logs de despliegue y dominios",
    },
    benchmarks: {
      heading: "Medido en servidores reales, no estimaciones",
      body: "Datos capturados con docker stats en máquinas virtuales limpias. Verificado de punta a punta en la instancia más pequeña posible sin cierres por falta de memoria (OOM).",
      stats: [
        { value: "23 MB", label: "Control plane de Kuberfy", sub: "API, dashboard y lector SQLite" },
        { value: "14 MB", label: "Proxy inverso Traefik", sub: "Terminación TLS y renovación Let's Encrypt" },
        { value: "1 vCPU / 1 GB", label: "VPS mínimo verificado", sub: "Instala y corre con carga real sin fallar" },
        { value: "< 60s", label: "Instalación en 1 comando", sub: "Configura Docker, Swarm, Traefik y Kuberfy" },
      ],
      note: "El resto de la memoria de tu servidor queda libre para tus aplicaciones reales, no consumida por el panel de control.",
    },
    comparison: {
      heading: "Por qué Kuberfy rinde más en servidores pequeños",
      body: "La mayoría de plataformas autoalojadas instalan un servidor Postgres completo, Redis y un runtime interpretado solo para gestionar un puñado de contenedores. En un VPS de 1 GB o 2 GB, el panel consume casi toda la memoria antes de que puedas desplegar tu app.",
      tableHeaderFeature: "Arquitectura y Consumo",
      tableHeaderTypical: "PaaS típico (Coolify / Dokploy)",
      tableHeaderKuberfy: "Kuberfy",
      rows: [
        {
          feature: "Base de datos del panel",
          typical: "Contenedor PostgreSQL (~150–300 MB en reposo) con backups y migraciones manuales",
          kuberfy: "SQLite embebido: 1 archivo, cero procesos externos, cero consumo residual",
        },
        {
          feature: "Runtime del control plane",
          typical: "Node.js interpretado en cada arranque del sistema",
          kuberfy: "Binario estático compilado con Bun — arranque inmediato y memoria mínima",
        },
        {
          feature: "Servicios adicionales",
          typical: "Redis, gestor de colas, puentes WebSocket (Soketi)",
          kuberfy: "Ninguno — un solo proceso ligero gestiona API, UI y base de datos",
        },
        {
          feature: "Consumo de memoria en reposo",
          typical: "Entre 500 MB y 1.5 GB de RAM consumidos solo por la herramienta",
          kuberfy: "~37 MB de RAM en total (Kuberfy + Traefik combinados)",
        },
        {
          feature: "Hardware mínimo requerido",
          typical: "2 GB de RAM obligatorios; recomiendan 4 GB",
          kuberfy: "1 GB de RAM confirmado funcionando bajo cargas reales",
        },
        {
          feature: "TLS y Roteo de dominios",
          typical: "Scripts manuales de Certbot o proxies complejos",
          kuberfy: "Traefik con Let's Encrypt automatizado de fábrica",
        },
      ],
    },
    features: {
      heading: "Todo lo que necesitas para producción, nada de relleno",
      body: "El ciclo esencial de despliegue resuelto de forma directa y confiable.",
      items: [
        {
          title: "Despliegue desde Git o imagen Docker",
          body: "Apunta Kuberfy a tu repositorio con un Dockerfile, o despliega imágenes ya construidas desde Docker Hub o GitHub Container Registry.",
          tag: "Git y Registro",
        },
        {
          title: "36 plantillas de un clic",
          body: "Despliega Gitea, Vaultwarden, n8n y otras 33 apps de código abierto con secretos generados y volúmenes ya configurados.",
          tag: "Marketplace",
        },
        {
          title: "HTTPS automático y dominios personalizados",
          body: "Asocia tu dominio y Traefik emite y renueva certificados SSL con Let's Encrypt automáticamente. Cero configs manuales de Nginx.",
          tag: "Traefik + ACME",
        },
        {
          title: "Control plane en un solo binario",
          body: "Compilado en un ejecutable estático con SQLite integrado. Arranca en fracciones de segundo y deja tus recursos para tus apps.",
          tag: "Bun + SQLite",
        },
        {
          title: "Logs y salidas de build en tiempo real",
          body: "Sigue la salida de compilación y los logs de tus contenedores en tiempo real directamente en el panel. Una falla nunca es un misterio.",
          tag: "Logs en vivo",
        },
        {
          title: "Proyectos, variables y secretos",
          body: "Organiza servicios por proyecto con variables de entorno protegidas y redes internas aisladas con Docker Swarm overlay.",
          tag: "Aislamiento total",
        },
        {
          title: "Soporte nativo x86_64 y ARM64",
          body: "Imágenes multi-arquitectura oficiales. Corre de forma nativa en Raspberry Pi, Hetzner ARM, AWS Graviton y Oracle Cloud Free Tier.",
          tag: "Multi-arquitectura",
        },
      ],
    },
    architecture: {
      heading: "Arquitectura simple y robusta",
      body: "Sin microservicios frágiles interconectados. Tres capas pensadas para que tus aplicaciones jamás sufran caídas aunque actualices el panel.",
      step1Title: "1. Tráfico de Internet",
      step1Desc: "Las peticiones de los clientes llegan por los puertos estándar 80 y 443.",
      step2Title: "2. Borde Traefik",
      step2Desc: "Termina el cifrado TLS, renueva certificados y enruta directo a los contenedores.",
      step3Title: "3. Núcleo Kuberfy",
      step3Desc: "Un binario compilado de ~23 MB leyendo un archivo SQLite y comunicándose con el socket Docker.",
      step4Title: "4. Motor Docker Swarm",
      step4Desc: "Ejecuta tus contenedores en redes internas seguras y aisladas.",
      resilienceNote:
        "Principio de alta disponibilidad: Si Kuberfy se reinicia o se actualiza, Traefik continúa ruteando el tráfico directo a tus contenedores sin interrupciones.",
    },
    quickstart: {
      heading: "Instalación en 60 segundos",
      body: "Pega este comando en tu servidor Linux limpio. Kuberfy aprovisiona Docker, Swarm, Traefik y arranca el panel en automático.",
      tabInstall: "Instalar",
      tabUpdate: "Actualizar",
      tabUninstall: "Desinstalar",
      requirementsTitle: "Requisitos del Servidor",
      requirements: [
        "Servidor limpio con Ubuntu 22.04 / 24.04 o Debian 12",
        "1 vCPU, 1 GB de RAM, 10 GB de disco libre",
        "Acceso root (o sudo)",
        "Puertos 80 y 443 libres y accesibles desde internet",
      ],
      copyCmd: "Copiar Comando",
    },
    faq: {
      heading: "Preguntas Frecuentes",
      body: "Respuestas claras sobre el funcionamiento técnico de Kuberfy.",
      items: [
        {
          question: "¿Por qué Kuberfy usa SQLite en lugar de PostgreSQL?",
          answer:
            "Para una plataforma en un solo servidor administrando decenas o cientos de contenedores, SQLite ofrece tiempos de consulta en submilisegundos y cero consumo de memoria adicional. PostgreSQL consumiría entre 150 y 300 MB de RAM solo para estar ocioso. Además, respaldar Kuberfy consiste simplemente en copiar un archivo `.sqlite`.",
        },
        {
          question: "¿Mis aplicaciones se caen si el panel de Kuberfy se detiene o actualiza?",
          answer:
            "No. Traefik y Docker Swarm mantienen el ciclo de vida de los contenedores y el ruteo de forma independiente. Kuberfy solo gestiona el estado: si el contenedor de Kuberfy se detiene, tus aplicaciones siguen recibiendo tráfico con normalidad.",
        },
        {
          question: "¿Funciona en servidores ARM como Oracle Cloud Free Tier o Raspberry Pi?",
          answer:
            "Sí. La imagen oficial de Kuberfy se compila con soporte multi-arquitectura para amd64 (x86_64) y arm64. Funciona de inmediato en instancias ARM de AWS Graviton, Hetzner, Oracle Cloud y Apple Silicon local.",
        },
        {
          question: "¿Kuberfy es de código abierto?",
          answer:
            "Sí, Kuberfy es código abierto bajo licencia BUSL 1.1. Puedes auditar el código fuente en GitHub, autoalojarlo en tus servidores y utilizarlo tanto para proyectos personales como comerciales.",
        },
      ],
    },
    cta: {
      heading: "¿Listo para recuperar los recursos de tu servidor?",
      subtitle: "Instala Kuberfy en menos de un minuto y despliega sin sobrecargar tu VPS.",
      button: "Instalar Kuberfy Ahora",
      note: "Sin tarjetas de crédito. Gratis y código abierto.",
    },
    footer: {
      tagline: "PaaS autoalojado ultraliviano. Un solo binario. Base de datos embebida.",
      github: "Repositorio en GitHub",
      documentation: "Documentación",
      issues: "Reportar Problema",
      license: "Licencia BUSL 1.1",
      copyright: "© 2026 Kuberfy. Hecho para desarrolladores.",
    },
  },
  "pt-BR": {
    nav: {
      comparison: "Por que Kuberfy",
      benchmarks: "Desempenho",
      features: "Recursos",
      architecture: "Arquitetura",
      quickstart: "Instalar",
      docs: "Docs",
      installBtn: "Começar",
    },
    hero: {
      badge: "Consumo medido: ~23 MB RAM • 0 bancos de dados externos",
      titleLine1: "Implante suas aplicações no seu próprio servidor.",
      titleEmber: "Sem devorar sua memória.",
      subtitle:
        "Kuberfy é uma PaaS auto-hospedada ultraleve: um único binário compilado, banco de dados SQLite embutido e Traefik para HTTPS automático. Sem Postgres para gerenciar, sem Redis para justificar.",
      installNote: "Execute em um servidor limpo com Ubuntu ou Debian e acesso root.",
      copy: "Copiar",
      copied: "Copiado!",
      viewDocs: "Documentação",
      githubStars: "Ver no GitHub",
      requirements: "Confirmado em 1 vCPU / 1 GB RAM (VPS de $3–$5/mês) • x86_64 e ARM64",
    },
    mockup: {
      urlBar: "dashboard.seudominio.com",
      screenshotPlaceholder: "Captura do painel em breve",
      screenshotAlt: "Painel do Kuberfy mostrando aplicações ativas, logs de deploy e domínios",
    },
    benchmarks: {
      heading: "Medido em servidores reais, sem estimativas teóricas",
      body: "Dados coletados com docker stats em máquinas virtuais limpas. Testado de ponta a ponta na menor instância disponível sem falhas de falta de memória (OOM).",
      stats: [
        { value: "23 MB", label: "Control plane do Kuberfy", sub: "API, interface web e leitor SQLite" },
        { value: "14 MB", label: "Proxy reverso Traefik", sub: "Terminação TLS e renovação Let's Encrypt" },
        { value: "1 vCPU / 1 GB", label: "VPS mínimo confirmado", sub: "Instala e roda sob carga real sem travamentos" },
        { value: "< 60s", label: "Instalação em 1 comando", sub: "Configura Docker, Swarm, Traefik e Kuberfy" },
      ],
      note: "O restante da memória do servidor fica totalmente disponível para suas aplicações reais, sem ser drenado pelo painel.",
    },
    comparison: {
      heading: "Por que o Kuberfy supera os concorrentes em servidores modestos",
      body: "A maioria das plataformas auto-hospedadas empacota um servidor Postgres completo, Redis e um runtime interpretado só para gerenciar alguns containers. Em uma VPS de 1 GB ou 2 GB, o painel consome quase toda a memória antes de você rodar seu app.",
      tableHeaderFeature: "Arquitetura e Recursos",
      tableHeaderTypical: "PaaS típica (Coolify / Dokploy)",
      tableHeaderKuberfy: "Kuberfy",
      rows: [
        {
          feature: "Banco de dados do painel",
          typical: "Container PostgreSQL (~150–300 MB em repouso) com rotinas de backup pesadas",
          kuberfy: "SQLite embutido: 1 arquivo único, zero processos extras, zero desperdício",
        },
        {
          feature: "Runtime do control plane",
          typical: "Node.js interpretado em cada inicialização do sistema",
          kuberfy: "Binário estático compilado com Bun — inicialização instantânea e pegada mínima",
        },
        {
          feature: "Serviços adicionais",
          typical: "Redis, workers de fila, pontes WebSocket (Soketi)",
          kuberfy: "Nenhum — um processo leve faz tudo (API, painel e banco)",
        },
        {
          feature: "Uso de memória em repouso",
          typical: "Entre 500 MB e 1.5 GB de RAM gastos só com a plataforma",
          kuberfy: "~37 MB de RAM no total (Kuberfy + Traefik somados)",
        },
        {
          feature: "Hardware mínimo requerido",
          typical: "2 GB de RAM obrigatórios; recomendam 4 GB",
          kuberfy: "1 GB de RAM confirmado em produção sem problemas",
        },
        {
          feature: "TLS e Roteamento",
          typical: "Scripts manuais com Certbot ou proxies complexos",
          kuberfy: "Traefik integrado com emissão e renovação Let's Encrypt automática",
        },
      ],
    },
    features: {
      heading: "Tudo o que você precisa para produção, sem excessos",
      body: "O ciclo essencial de deploy resolvido de forma direta e previsível.",
      items: [
        {
          title: "Deploy via Git ou Imagem Docker",
          body: "Aponte o Kuberfy para um repositório com Dockerfile ou use imagens prontas do Docker Hub ou GitHub Container Registry.",
          tag: "Git & Registry",
        },
        {
          title: "36 templates de 1 clique",
          body: "Implante Gitea, Vaultwarden, n8n e outras 33 apps open-source com segredos gerados e volumes já configurados.",
          tag: "Marketplace",
        },
        {
          title: "HTTPS Automático & Domínios Personalizados",
          body: "Adicione seu domínio e o Traefik negocia certificados Let's Encrypt automaticamente. Sem editar arquivos Nginx.",
          tag: "Traefik + ACME",
        },
        {
          title: "Control Plane em Binário Único",
          body: "Compilado com Bun e SQLite embutido. Inicia em frações de segundo e preserva os recursos da máquina para sua aplicação.",
          tag: "Bun + SQLite",
        },
        {
          title: "Logs e Saídas de Build em Tempo Real",
          body: "Acompanhe o log da compilação e a saída dos containers em tempo real diretamente no painel de controle.",
          tag: "Logs ao vivo",
        },
        {
          title: "Projetos, Variáveis e Segredos",
          body: "Agrupe serviços sob projetos isolados com variáveis de ambiente protegidas e redes seguras no Docker Swarm.",
          tag: "Isolamento total",
        },
        {
          title: "Suporte Nativo a x86_64 e ARM64",
          body: "Imagens multi-arch oficiais. Roda perfeitamente em Raspberry Pi, Hetzner ARM, AWS Graviton e Oracle Cloud Free Tier.",
          tag: "Multi-arquitetura",
        },
      ],
    },
    architecture: {
      heading: "Arquitetura simples e à prova de falhas",
      body: "Sem microserviços frágeis. Três camadas projetadas para que seus apps nunca sofram quedas, mesmo se o painel for reiniciado ou atualizado.",
      step1Title: "1. Tráfego da Internet",
      step1Desc: "Requisições chegam diretamente pelas portas padrão 80 e 443.",
      step2Title: "2. Borda Traefik",
      step2Desc: "Termina o SSL/TLS, renova certificados e encaminha o tráfego direto para os containers.",
      step3Title: "3. Núcleo Kuberfy",
      step3Desc: "Binário compilado de ~23 MB acessando o arquivo SQLite e gerenciando o socket Docker.",
      step4Title: "4. Motor Docker Swarm",
      step4Desc: "Executa seus containers em redes internas seguras e isoladas.",
      resilienceNote: "Princípio de alta disponibilidade: Se o Kuberfy reiniciar ou atualizar, o Traefik continua roteando requisições aos containers normalmente.",
    },
    quickstart: {
      heading: "Instale em 60 segundos",
      body: "Cole este comando no seu servidor Linux limpo. O Kuberfy provisiona Docker, Swarm, Traefik e inicia o painel automaticamente.",
      tabInstall: "Instalar",
      tabUpdate: "Atualizar",
      tabUninstall: "Desinstalar",
      requirementsTitle: "Requisitos do Servidor",
      requirements: [
        "Servidor limpo com Ubuntu 22.04 / 24.04 ou Debian 12",
        "1 vCPU, 1 GB de RAM, 10 GB de disco livre",
        "Acesso root (ou sudo)",
        "Portas 80 e 443 liberadas na internet",
      ],
      copyCmd: "Copiar Comando",
    },
    faq: {
      heading: "Perguntas Frequentes",
      body: "Respostas diretas sobre o funcionamento técnico do Kuberfy.",
      items: [
        {
          question: "Por que o Kuberfy usa SQLite em vez de PostgreSQL?",
          answer:
            "Para uma plataforma em servidor único gerenciando dezenas de containers, o SQLite entrega tempos de resposta em submilissegundos e consumo zero de RAM ociosa. O PostgreSQL exigiria 150 a 300 MB de RAM só para existir. Fazer backup consiste apenas em copiar um arquivo `.sqlite`.",
        },
        {
          question: "Meus apps saem do ar se o painel do Kuberfy reiniciar ou atualizar?",
          answer:
            "Não. O Traefik e o Docker Swarm mantêm o roteamento e o ciclo dos containers de forma desacoplada. O Kuberfy só gerencia o estado — se o container do Kuberfy parar, seus apps continuam servindo tráfego normalmente.",
        },
        {
          question: "Funciona em servidores ARM como Oracle Cloud Free Tier ou Raspberry Pi?",
          answer:
            "Sim. A imagem oficial é distribuída com suporte nativo para amd64 (x86_64) e arm64. Funciona sem alterações no Hetzner ARM, AWS Graviton, Apple Silicon e instâncias Oracle ARM.",
        },
        {
          question: "O Kuberfy é código aberto?",
          answer: "Sim, o Kuberfy é open source sob licença BUSL 1.1. O código é público no GitHub para auditoria, uso pessoal e uso comercial em seus próprios servidores.",
        },
      ],
    },
    cta: {
      heading: "Pronto para recuperar a memória do seu servidor?",
      subtitle: "Instale o Kuberfy em menos de um minuto e implante sem sobrecarregar sua VPS.",
      button: "Instalar Kuberfy Agora",
      note: "Sem cartão de crédito. Gratuito e código aberto.",
    },
    footer: {
      tagline: "PaaS auto-hospedada ultraleve. Binário único. Banco de dados embutido.",
      github: "Repositório no GitHub",
      documentation: "Documentação",
      issues: "Reportar Problema",
      license: "Licença BUSL 1.1",
      copyright: "© 2026 Kuberfy. Feito para desenvolvedores.",
    },
  },
};
