export type Locale = "en" | "es" | "pt-BR";
export const LOCALE_PATHS: Record<Locale, string> = { en: "/", es: "/es/", "pt-BR": "/pt-br/" };

interface HomeStrings {
  nav: { lighter: string; features: string; architecture: string; benchmarks: string; docs: string };
  hero: {
    badge: string;
    titleLine1: string;
    titleEmber: string;
    subtitle: string;
    installNote: string;
    copy: string;
    copied: string;
  };
  lighter: {
    heading: string;
    body: string;
    tableHeaderTypical: string;
    tableHeaderKuberfy: string;
    comparison: Array<{ row: string; typical: string; kuberfy: string }>;
  };
  benchmarks: {
    heading: string;
    body: string;
    stats: Array<{ value: string; label: string }>;
    note: string;
  };
  features: {
    heading: string;
    body: string;
    items: Array<{ title: string; body: string }>;
  };
  architecture: {
    heading: string;
    body: string;
    internet: string;
    edgeNote: string;
    dashboardNote: string;
    dbNote: string;
    appA: string;
    appB: string;
    appC: string;
    dockerNote: string;
  };
  footer: { tagline: string; github: string; documentation: string; issues: string };
}

export const strings: Record<Locale, HomeStrings> = {
  en: {
    nav: { lighter: "Why it's lighter", features: "Features", architecture: "Architecture", benchmarks: "Benchmarks", docs: "Docs" },
    hero: {
      badge: "Self-hosted PaaS",
      titleLine1: "Deploy anything.",
      titleEmber: "Run almost nothing.",
      subtitle:
        "Kuberfy is the lightest self-hosted platform for shipping applications from your own servers — a single compiled binary, an embedded database, and Traefik for HTTPS. No Postgres to babysit, no Redis to justify.",
      installNote: "One command, one Linux server, root access. That's the whole install.",
      copy: "Copy",
      copied: "Copied",
    },
    lighter: {
      heading: "Why it's lighter",
      body: "Most self-hosted platforms bundle a database server, a cache, and a full interpreted runtime just to manage a handful of containers. Kuberfy's control plane is a single compiled process reading a single SQLite file.",
      tableHeaderTypical: "Typical self-hosted PaaS",
      tableHeaderKuberfy: "Kuberfy",
      comparison: [
        { row: "Database", typical: "Postgres server to run and back up", kuberfy: "Embedded SQLite — no server, no backups to schedule" },
        { row: "Runtime", typical: "Node.js interpreting your app on every boot", kuberfy: "Compiled binary — starts instantly, nothing to interpret" },
        { row: "Base image", typical: "A few hundred MB of OS and runtime", kuberfy: "Alpine, ~5 MB before your app" },
        { row: "Extra services", typical: "Redis, queue workers, cron runners", kuberfy: "None — one process does it all" },
        { row: "TLS certificates", typical: "Manual renewal or a bundled proxy to babysit", kuberfy: "Traefik + Let's Encrypt, renewed automatically" },
      ],
    },
    benchmarks: {
      heading: "Measured, not estimated",
      body: "These numbers come from real Multipass VMs, not a spec sheet — steady-state usage captured with docker stats, and the install itself verified end-to-end on the smallest instance size that still worked.",
      stats: [
        { value: "23 MB", label: "Kuberfy control plane, steady-state RAM" },
        { value: "14 MB", label: "Traefik, steady-state RAM" },
        { value: "1 vCPU / 1 GB", label: "Confirmed minimum — installs and runs with no OOM" },
        { value: "~5 MB", label: "Base image, before your application" },
      ],
      note: "The rest of a server's memory goes to dockerd, containerd, and buildkit — not to Kuberfy itself.",
    },
    features: {
      heading: "Everything you need, nothing you don't",
      body: "The core deploy loop, done well — not a platform trying to be everything at once.",
      items: [
        { title: "Deploy from Git or an image", body: "Point Kuberfy at a repository and Dockerfile, or an existing image. It builds or pulls, then runs it." },
        { title: "Automatic HTTPS", body: "Every application gets a routed domain and a signed certificate the moment it's attached — no manual config." },
        { title: "Projects & applications", body: "Group related services under a project, each with its own applications, domains, and deploy history." },
        { title: "Full deploy history", body: "Every build and run is recorded with its status and complete output, so a failure is never a mystery." },
        { title: "Role-based access", body: "Email and password auth with an admin role, so you can hand out access without handing out root." },
        { title: "One-command install", body: "A single script provisions Docker, Swarm, Traefik, and Kuberfy itself on a bare server." },
      ],
    },
    architecture: {
      heading: "One process, three moving parts",
      body: "Traefik terminates TLS at the edge. Kuberfy holds the state and talks to the Docker socket. Docker runs your containers. That's the entire runtime footprint.",
      internet: "Internet",
      edgeNote: ":80 / :443, ACME",
      dashboardNote: "API + dashboard",
      dbNote: "SQLite, one file",
      appA: "Your app A",
      appB: "Your app B",
      appC: "Your app C",
      dockerNote: "builds & runs via the Docker socket",
    },
    footer: { tagline: "Self-hosted. Open source. Actively developed.", github: "GitHub", documentation: "Documentation", issues: "Issues" },
  },
  es: {
    nav: { lighter: "Por qué pesa menos", features: "Funciones", architecture: "Arquitectura", benchmarks: "Benchmarks", docs: "Docs" },
    hero: {
      badge: "PaaS autoalojado",
      titleLine1: "Desplegá lo que sea.",
      titleEmber: "Corré casi nada.",
      subtitle:
        "Kuberfy es la plataforma autoalojada más liviana para correr aplicaciones en tus propios servidores — un binario compilado único, una base de datos embebida y Traefik para HTTPS. Sin Postgres que mantener, sin Redis que justificar.",
      installNote: "Un comando, un servidor Linux, acceso root. Eso es toda la instalación.",
      copy: "Copiar",
      copied: "Copiado",
    },
    lighter: {
      heading: "Por qué pesa menos",
      body: "La mayoría de las plataformas autoalojadas incluyen un servidor de base de datos, una caché y un runtime interpretado completo solo para manejar un puñado de contenedores. El control plane de Kuberfy es un único proceso compilado leyendo un único archivo SQLite.",
      tableHeaderTypical: "PaaS autoalojado típico",
      tableHeaderKuberfy: "Kuberfy",
      comparison: [
        { row: "Base de datos", typical: "Servidor Postgres para correr y respaldar", kuberfy: "SQLite embebido — sin servidor, sin backups que programar" },
        { row: "Runtime", typical: "Node.js interpretando tu app en cada arranque", kuberfy: "Binario compilado — arranca al instante, nada que interpretar" },
        { row: "Imagen base", typical: "Varios cientos de MB de SO y runtime", kuberfy: "Alpine, ~5 MB antes de tu app" },
        { row: "Servicios extra", typical: "Redis, workers de colas, cron runners", kuberfy: "Ninguno — un solo proceso hace todo" },
        { row: "Certificados TLS", typical: "Renovación manual o un proxy propio que mantener", kuberfy: "Traefik + Let's Encrypt, renovación automática" },
      ],
    },
    benchmarks: {
      heading: "Medido, no estimado",
      body: "Estos números salen de VMs Multipass reales, no de una ficha técnica — uso en estado estable capturado con docker stats, y la instalación verificada de punta a punta en el tamaño de instancia más chico que igual funcionó.",
      stats: [
        { value: "23 MB", label: "Control plane de Kuberfy, RAM en estado estable" },
        { value: "14 MB", label: "Traefik, RAM en estado estable" },
        { value: "1 vCPU / 1 GB", label: "Mínimo confirmado — instala y corre sin quedarse sin memoria" },
        { value: "~5 MB", label: "Imagen base, antes de tu aplicación" },
      ],
      note: "El resto de la memoria del servidor la usan dockerd, containerd y buildkit — no Kuberfy en sí.",
    },
    features: {
      heading: "Todo lo que necesitás, nada de lo que no",
      body: "El ciclo de deploy central, bien hecho — no una plataforma que intenta ser todo a la vez.",
      items: [
        { title: "Deploy desde Git o una imagen", body: "Apuntá Kuberfy a un repositorio y Dockerfile, o a una imagen existente. Buildea o descarga, y la corre." },
        { title: "HTTPS automático", body: "Cada aplicación recibe un dominio ruteado y un certificado firmado en el momento en que se conecta — sin configuración manual." },
        { title: "Proyectos y aplicaciones", body: "Agrupá servicios relacionados bajo un proyecto, cada uno con sus propias aplicaciones, dominios e historial de deploys." },
        { title: "Historial de deploy completo", body: "Cada build y ejecución queda registrado con su estado y salida completa, así una falla nunca es un misterio." },
        { title: "Acceso basado en roles", body: "Auth con email y contraseña más un rol de admin, para repartir acceso sin repartir root." },
        { title: "Instalación de un comando", body: "Un único script provisiona Docker, Swarm, Traefik y el propio Kuberfy en un servidor limpio." },
      ],
    },
    architecture: {
      heading: "Un proceso, tres piezas móviles",
      body: "Traefik termina el TLS en el borde. Kuberfy guarda el estado y habla con el socket de Docker. Docker corre tus contenedores. Eso es todo el footprint de runtime.",
      internet: "Internet",
      edgeNote: ":80 / :443, ACME",
      dashboardNote: "API + dashboard",
      dbNote: "SQLite, un archivo",
      appA: "Tu app A",
      appB: "Tu app B",
      appC: "Tu app C",
      dockerNote: "buildea y corre vía el socket de Docker",
    },
    footer: { tagline: "Autoalojado. Open source. Desarrollo activo.", github: "GitHub", documentation: "Documentación", issues: "Issues" },
  },
  "pt-BR": {
    nav: { lighter: "Por que é mais leve", features: "Recursos", architecture: "Arquitetura", benchmarks: "Benchmarks", docs: "Docs" },
    hero: {
      badge: "PaaS auto-hospedado",
      titleLine1: "Implante qualquer coisa.",
      titleEmber: "Rode quase nada.",
      subtitle:
        "Kuberfy é a plataforma auto-hospedada mais leve para rodar aplicações nos seus próprios servidores — um único binário compilado, um banco de dados embutido e Traefik para HTTPS. Sem Postgres para cuidar, sem Redis para justificar.",
      installNote: "Um comando, um servidor Linux, acesso root. É essa a instalação inteira.",
      copy: "Copiar",
      copied: "Copiado",
    },
    lighter: {
      heading: "Por que é mais leve",
      body: "A maioria das plataformas auto-hospedadas empacota um servidor de banco de dados, um cache e um runtime interpretado completo só para gerenciar alguns containers. O control plane do Kuberfy é um único processo compilado lendo um único arquivo SQLite.",
      tableHeaderTypical: "PaaS auto-hospedado típico",
      tableHeaderKuberfy: "Kuberfy",
      comparison: [
        { row: "Banco de dados", typical: "Servidor Postgres para rodar e fazer backup", kuberfy: "SQLite embutido — sem servidor, sem backups para agendar" },
        { row: "Runtime", typical: "Node.js interpretando sua app a cada boot", kuberfy: "Binário compilado — inicia instantaneamente, nada para interpretar" },
        { row: "Imagem base", typical: "Algumas centenas de MB de SO e runtime", kuberfy: "Alpine, ~5 MB antes da sua app" },
        { row: "Serviços extras", typical: "Redis, workers de fila, cron runners", kuberfy: "Nenhum — um único processo faz tudo" },
        { row: "Certificados TLS", typical: "Renovação manual ou um proxy próprio para cuidar", kuberfy: "Traefik + Let's Encrypt, renovado automaticamente" },
      ],
    },
    benchmarks: {
      heading: "Medido, não estimado",
      body: "Esses números vêm de VMs Multipass reais, não de uma ficha técnica — uso em regime permanente capturado com docker stats, e a instalação verificada de ponta a ponta no menor tamanho de instância que ainda funcionou.",
      stats: [
        { value: "23 MB", label: "Control plane do Kuberfy, RAM em regime permanente" },
        { value: "14 MB", label: "Traefik, RAM em regime permanente" },
        { value: "1 vCPU / 1 GB", label: "Mínimo confirmado — instala e roda sem falta de memória" },
        { value: "~5 MB", label: "Imagem base, antes da sua aplicação" },
      ],
      note: "O resto da memória do servidor vai para dockerd, containerd e buildkit — não para o Kuberfy em si.",
    },
    features: {
      heading: "Tudo que você precisa, nada do que não precisa",
      body: "O ciclo de deploy essencial, bem feito — não uma plataforma tentando ser tudo ao mesmo tempo.",
      items: [
        { title: "Deploy via Git ou imagem", body: "Aponte o Kuberfy para um repositório e Dockerfile, ou uma imagem existente. Ele builda ou baixa, e roda." },
        { title: "HTTPS automático", body: "Cada aplicação recebe um domínio roteado e um certificado assinado no momento em que é conectada — sem configuração manual." },
        { title: "Projetos e aplicações", body: "Agrupe serviços relacionados sob um projeto, cada um com suas próprias aplicações, domínios e histórico de deploys." },
        { title: "Histórico de deploy completo", body: "Cada build e execução fica registrado com seu status e saída completa, então uma falha nunca é um mistério." },
        { title: "Acesso baseado em papéis", body: "Autenticação por email e senha com um papel de admin, para distribuir acesso sem distribuir root." },
        { title: "Instalação em um comando", body: "Um único script provisiona Docker, Swarm, Traefik e o próprio Kuberfy em um servidor limpo." },
      ],
    },
    architecture: {
      heading: "Um processo, três peças móveis",
      body: "O Traefik termina o TLS na borda. O Kuberfy guarda o estado e fala com o socket do Docker. O Docker roda seus containers. Esse é todo o footprint de runtime.",
      internet: "Internet",
      edgeNote: ":80 / :443, ACME",
      dashboardNote: "API + dashboard",
      dbNote: "SQLite, um arquivo",
      appA: "Sua app A",
      appB: "Sua app B",
      appC: "Sua app C",
      dockerNote: "builda e roda via o socket do Docker",
    },
    footer: { tagline: "Auto-hospedado. Open source. Desenvolvimento ativo.", github: "GitHub", documentation: "Documentação", issues: "Issues" },
  },
};
