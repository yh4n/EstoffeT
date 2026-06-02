require("dotenv").config();
const express = require("express");
const path = require("path");
const session = require("express-session");
const db = require("./BackEnd/src/config/database");
const nodemailer = require("nodemailer");
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// Defina uma chave secreta forte para assinar os tokens
const SECRET_KEY = "EstoffeMoveisPlanejados2026";


const app = express();
const PORT = process.env.PORT || 3005;

// ==========================================
// 1. CONFIGURAÇÕES E MIDDLEWARES
// ==========================================

// Configuração de Views (EJS)
app.set("views", path.join(__dirname, "FrontEnd", "pages"));
app.set("view engine", "ejs");

// Parsers para ler dados de formulários e JSON
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Servir arquivos estáticos (CSS, Imagens, JS do Front)
app.use(express.static(path.join(__dirname, "FrontEnd")));

// Configuração da Sessão
app.use(
  session({
    secret: process.env.SESSION_SECRET || "EstoffeMoveisPlanejados2026!",
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }, // Defina como true se usar HTTPS em produção
  }),
);

// Middleware de Proteção de Rotas (Garante que só logados acessem os painéis)
const verificarAutenticacao = (req, res, next) => {
  if (req.session && req.session.usuario) {
    return next();
  }
  return res.redirect("/login");
};

function verificarAutenticacao(tiposPermitidos) {
    return (req, res, next) => {
        const usuario = req.session.usuario;

        // Verifica se o usuário está logado na sessão
        if (!usuario || !usuario.token) {
            return res.redirect("/login");
        }

        try {
            // O JWT verifica se o token guardado na sessão é legítimo e não foi alterado
            const decodificado = jwt.verify(usuario.token, SECRET_KEY);

            // Verifica se o tipo de usuário (admin, cliente, etc) tem permissão para essa rota
            if (tiposPermitidos.includes(decodificado.tipo)) {
                return next(); // Tudo certo! Segue para a página
            } else {
                return res.status(403).send("Acesso negado: Você não tem permissão para ver esta página.");
            }
        } catch (error) {
            // Se o token estiver expirado ou for inválido, limpa a sessão e desloga
            req.session.destroy();
            return res.redirect("/login");
        }
    };
}
// ==========================================
// 2. ROTAS GET (Visualização de Páginas)
// ==========================================

// Página Inicial Institucional
app.get("/", (req, res) => {
  res.render("index", { usuario: req.session.usuario || null });
});

// Rota para a página de produtos
app.get("/produtos", async (req, res) => {
    const categoriaSelecionada = req.query.categoria;
    const usuarioLogado = req.session.usuario || null;

    try {
        const [categorias] = await db.query("SELECT * FROM categoria");

        let queryProdutos = "SELECT * FROM produto";
        let params = [];

        if (categoriaSelecionada) {
            queryProdutos += " WHERE codCategoria = ?";
            params.push(categoriaSelecionada);
        }

        const [produtos] = await db.query(queryProdutos, params);

        // Renderiza a página enviando as variáveis
        res.render("produtos", {
            usuario: usuarioLogado,
            produtos: produtos,
            categorias: categorias,
            categoriaAtiva: categoriaSelecionada || null
        });

    } catch (error) {
        // Se der qualquer erro no banco, ele cai e avisa aqui no terminal
        console.error("Erro detalhado no banco de dados:", error);
        res.status(500).send("Erro interno ao carregar a página de produtos.");
    }
});

// Rota para exibir a página de cadastro de produto
app.get("/admin/produtos/novo", async (req, res) => {
    // Opcional: Verificar se o usuário é admin antes de liberar a página
    if (!req.session.usuario || req.session.usuario.tipo !== 'admin') {
        return res.redirect("/login");
    }

    try {
        // Busca as categorias para listar no <select> do formulário
        const [categorias] = await db.query("SELECT * FROM categoria");
        
        res.render("admin/novo-produto", {
            usuario: req.session.usuario,
            categorias: categorias
        });
    } catch (error) {
        console.error("Erro ao carregar tela de cadastro:", error);
        res.status(500).send("Erro interno ao carregar a página.");
    }
});
// Rota para processar o formulário e inserir no banco
app.post("/admin/produtos/salvar", async (req, res) => {
    const { nome, preco, codCategoria, imagem } = req.body;

    try {
        // Define uma imagem padrão caso o campo venha vazio
        const caminhoImagem = imagem || 'image/default.jpg';

        const queryInsert = "INSERT INTO produto (nome, preco, imagem, codCategoria) VALUES (?, ?, ?, ?)";
        await db.query(queryInsert, [nome, preco, caminhoImagem, codCategoria]);

        // Após salvar, redireciona para a página de produtos ou para o painel
        res.redirect("/produtos");
    } catch (error) {
        console.error("Erro ao salvar produto:", error);
        res.status(500).send("Erro ao cadastrar o produto no banco de dados.");
    }
});

// Rota para a página de produtos
app.get("/contato", (req, res) => {
  // Ajuste o caminho abaixo dependendo de onde está sua pasta FrontEnd
  res.render("contato", { error: null, usuario: req.session.usuario || null });
});


// Configuração do transportador de e-mail (Exemplo usando Gmail)
// Dica: Para testar localmente de forma fictícia, você pode usar o serviço "Mailtrap"
const transportador = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: "diaseduardoyo@gmail.com", // O e-mail da sua loja
        pass: "fhme pucp nrgk vuhe"     // Senha de aplicativo gerada na sua conta Google
    }
});

// Rota para processar o formulário de contato
app.post("/contato/enviar", async (req, res) => {
    const { nome, email, mensagem } = req.body;

    // Validação simples
    if (!nome || !email || !mensagem) {
        return res.status(400).send("Todos os campos são obrigatórios.");
    }

    try {
        // 1. Guarda no banco de dados local
        const queryInsert = "INSERT INTO contato_mensagem (nome, email, mensagem) VALUES (?, ?, ?)";
        await db.query(queryInsert, [nome, email, mensagem]);

        // 2. Configura e envia o e-mail para a loja
        const opcoesEmail = {
            from: `"${nome}" <${email}>`, 
            to: "diaseduardoyo@gmail.com", // Para onde a mensagem vai ser enviada
            subject: `Nova Mensagem de Contato - Estoffe (${nome})`,
            html: `
                <h2>Nova mensagem recebida pelo site!</h2>
                <p><strong>Nome:</strong> ${nome}</p>
                <p><strong>E-mail de Contato:</strong> ${email}</p>
                <p><strong>Mensagem:</strong></p>
                <p style="background: #f4f4f4; padding: 15px; border-left: 4px solid #14532d;">${mensagem}</p>
            `
        };

        await transportador.sendMail(opcoesEmail);

        // Redireciona de volta com sucesso (ou para onde desejar)
        res.redirect("/contato?sucesso=true");

    } catch (error) {
        console.error("Erro ao processar mensagem de contato:", error);
        res.status(500).send("Houve um erro interno ao enviar sua mensagem.");
    }
});
// Rota para a página de sobre
app.get("/sobre", (req, res) => {
  // Ajuste o caminho abaixo dependendo de onde está sua pasta FrontEnd
  res.render("sobre", { error: null, usuario: req.session.usuario || null });
});

// Tela de Login
app.get("/login", (req, res) => {
  res.render("login", { error: null });
});

// Tela de Registro
app.get("/register", (req, res) => {
  res.render("register", {
    usuario: req.session.usuario || null, // Envia null se não estiver logado
  });
});

// Painel do Admin (Protegido)
app.get("/admin-dashboard", verificarAutenticacao(["admin"]), async (req, res) => {
  if (req.session.usuario.tipo !== "admin") {
    return res.redirect("/client-dashboard");
  }

  try {
    // 1. Novos Orçamentos = Status 'Aberto'
    const [[{ totalOrcamentos }]] = await db.query(
      "SELECT COUNT(*) as totalOrcamentos FROM pedido WHERE status = 'Aberto'",
    );

    // 2. Concluídos = Status 'Pronto' ou 'Entregue'
    const [[{ totalConcluidos }]] = await db.query(
      "SELECT COUNT(*) AS totalConcluidos FROM pedido WHERE status IN ('Pronto', 'Entregue')",
    );

    // 3. Quantidade de estofadores ativos
    const [[{ totalEstofadores }]] = await db.query(
      "SELECT COUNT(*) as totalEstofadores FROM usuario WHERE tipo = 'estofador'",
    );

    // Lista dos estofadores ativos para o painel
    const [listaEstofadores] = await db.query(
      "SELECT codUsuario, nome, email FROM usuario WHERE tipo = 'estofador' ORDER BY nome ASC",
    );

    // 4. Últimas Ordens de Serviço (Apenas o que NÃO está Pronto e NÃO está Entregue)
    // Procure a query das ordensServico dentro de app.get("/admin-dashboard")
    const [ordensServico] = await db.query(`
  SELECT
      p.codPedido,
      u_cli.nome AS nomeCliente,
      p.dataPedido,
      u_est.nome AS nomeEstofador, p.status
  FROM pedido p
  INNER JOIN cliente c ON p.codCliente = c.codCliente
  INNER JOIN usuario u_cli ON c.codUsuario = u_cli.codUsuario
  LEFT JOIN usuario u_est ON p.codEstofador = u_est.codUsuario
  ORDER BY p.codPedido DESC
  LIMIT 5
`);
    // 5. Renderiza a página enviando os dados mapeados sem erros de inicialização
    res.render("admin/admin-dashboard", {
      usuario: req.session.usuario,
      totalOrcamentos: totalOrcamentos || 0,
      totalConcluidos: totalConcluidos || 0,
      totalEstofadores: totalEstofadores || 0,
      ordensServico: ordensServico,
      listaEstofadores: listaEstofadores,
    });
  } catch (error) {
    console.error("ERRO DETALHADO NO TERMINAL:", error);
    res.status(500).send("Erro interno ao carregar o painel de controle.");
  }
});

// Painel admin-Estofador
app.get("/admin/estofadores", verificarAutenticacao(["admin"]), async (req, res) => {
  if (req.session.usuario.tipo !== "admin") {
    return res.redirect("/client-dashboard");
  }

  try {
    const [estofadores] = await db.query(
      "SELECT codUsuario, nome, email FROM usuario WHERE tipo = 'estofador' ORDER BY nome ASC",
    );

    res.render("admin/estofadores", {
      usuario: req.session.usuario,
      estofadores,
    });
  } catch (error) {
    console.error("Erro ao listagem estofadores:", error);
    res.status(500).send("Erro interno ao carregar a página de estofadores.");
  }
});
// ==========================================
// ROTAS DO ADMINISTRADOR (GERENTE)
// ==========================================
app.get("/admin/dashboard", verificarAutenticacao(["admin"]), async (req, res) => {
  if (req.session.usuario.tipo !== "admin") return res.redirect("/login");
  res.render("admin/admin-dashboard", { usuario: req.session.usuario });
});

// ==========================================
// ROTAS DO ESTOFADOR (OFICINA)
// ==========================================
app.get("/estofador/dashboard", verificarAutenticacao(["estofador"]), async (req, res) => {
  if (req.session.usuario.tipo !== "estofador") return res.redirect("/login");

  res.render("estofador/estofador-dashboard", {
    usuario: req.session.usuario,
    indicadores: indicadores,
    ordens: ordens,
  });
});

// Rota para ver detalhadamente os Novos Orçamentos (Status: Aberto)
// 1ª ROTA: Lista Geral de Novos Orçamentos (Status: Aberto)
app.get("/admin/orcamentos", verificarAutenticacao(["admin", "estofador"]), async (req, res) => {
  // 1. Sua validação de segurança (Perfeita!)
  if (
    req.session.usuario.tipo !== "admin" &&
    req.session.usuario.tipo !== "estofador"
  ) {
    return res.redirect("/client-dashboard");
  }

  try {
    const tipoUsuario = req.session.usuario.tipo;

    // 2. Se quem entrou for o ADMIN
    if (tipoUsuario === "admin") {
      const [orcamentos] = await db.query(`
        SELECT p.*, u.nome AS nomeCliente 
        FROM pedido p
        INNER JOIN cliente c ON p.codCliente = c.codCliente
        INNER JOIN usuario u ON c.codUsuario = u.codUsuario
        WHERE p.status = 'Aberto'
        ORDER BY p.dataPedido DESC
      `);

      // Renderiza a página do administrador
      return res.render("admin/orcamentos", {
        usuario: req.session.usuario,
        orcamentos: orcamentos,
      });
    }

    // 3. Se quem entrou for o ESTOFADOR
    if (tipoUsuario === "estofador") {
      // Código para buscar os indicadores do estofador...
      // Código para buscar as ordens do estofador...

      // Renderiza a página do estofador
      return res.render("estofador/estofador-dashboard", {
        usuario: req.session.usuario,
        indicadores: indicadores,
        ordens: ordens,
      });
    }
  } catch (error) {
    console.error("Erro na rota centralizada:", error);
    res.status(500).send("Erro interno do servidor.");
  }
});

// 2ª ROTA: Detalhes para Analisar um Pedido Específico
// Reparou na URL? Ela bate exatamente com o link do botão "Analisar" (<%= item.codPedido %>)
app.get(
  "/admin/pedido/:id/analisar",
  verificarAutenticacao(["admin"]),
  async (req, res) => {
    if (req.session.usuario.tipo !== "admin") {
      return res.redirect("/client-dashboard");
    }

    try {
      const idPedido = req.params.id;

      // A) Busca os dados gerais do Pedido e do Cliente
      const [pedidos] = await db.query(
        `
      SELECT p.*, u.nome AS nomeCliente, u.email AS emailCliente 
      FROM pedido p
      INNER JOIN cliente c ON p.codCliente = c.codCliente
      INNER JOIN usuario u ON c.codUsuario = u.codUsuario
      WHERE p.codPedido = ?
    `,
        [idPedido],
      );

      if (pedidos.length === 0) {
        return res
          .status(404)
          .send("Orçamento não encontrado no banco de dados.");
      }

      let pedido = pedidos[0];

      // B) Busca os itens vinculados a este pedido (itempedido + produto)
      const [itens] = await db.query(
        `
      SELECT ip.quantidade, ip.precoUnitario,ip.observacao AS observacaoProduto, prod.nome AS nomeProduto 
      FROM itempedido ip
      INNER JOIN produto prod ON ip.codProduto = prod.codProduto
      WHERE ip.codPedido = ?
    `,
        [idPedido],
      );

      // Guarda a lista de itens dentro do objeto pedido
      pedido.itens = itens;

      // C) Busca a lista de Estofadores ativos para preencher o <select> da página
      const [estofadores] = await db.query(`
      SELECT codUsuario, nome 
      FROM usuario 
      WHERE tipo = 'estofador'
    `);

      // Renderiza a página de análise (analisar-pedido.ejs) enviando tudo o que ela pede
      res.render("admin/analisar-pedido", {
        usuario: req.session.usuario,
        pedido: pedido,
        estofadores: estofadores,
      });
    } catch (error) {
      console.error("Erro ao buscar detalhes do orçamento:", error);
      res.status(500).send("Erro interno do servidor.");
    }
  },
);

// Rota para Analisar produto
app.get(
  "/admin/pedido/:id/analisar",
  verificarAutenticacao(["admin"]),
  async (req, res) => {
    if (req.session.usuario.tipo !== "admin") {
      return res.redirect("/client-dashboard");
    }

    const idPedido = req.params.id;

    try {
      const [pedidoQuery] = await db.query(
        `
      SELECT p.codPedido, p.dataPedido, p.status, u.nome AS nomeCliente, u.email AS emailCliente
      FROM pedido p
      INNER JOIN cliente c ON p.codCliente = c.codCliente
      INNER JOIN usuario u ON c.codUsuario = u.codUsuario
      WHERE p.codPedido = ?
    `,
        [idPedido],
      );

      if (pedidoQuery.length === 0) {
        return res.status(404).send("Pedido não encontrado.");
      }

      const [estofadores] = await db.query(
        "SELECT codUsuario, nome FROM usuario WHERE tipo = 'estofador' ORDER BY nome ASC",
      );

      res.render("admin/analisar-pedido", {
        usuario: req.session.usuario,
        pedido: pedidoQuery[0],
        estofadores: estofadores,
      });
    } catch (error) {
      console.error("Erro ao carregar análise do pedido:", error);
      res.status(500).send("Erro interno ao carregar a página de análise.");
    }
  },
);

// Rota para ver detalhadamente os Pedidos Concluídos
app.get("/admin/producao", verificarAutenticacao(["admin"]), async (req, res) => {
  if (req.session.usuario.tipo !== "admin") {
    return res.redirect("/client-dashboard");
  }

  try {
    const [pedidosProducao] = await db.query(`
      SELECT 
          p.codPedido, 
          u_cli.nome AS nomeCliente, 
          p.dataPedido, 
          p.status,
          u_est.nome AS nomeEstofador
      FROM pedido p
      INNER JOIN cliente c ON p.codCliente = c.codCliente
      INNER JOIN usuario u_cli ON c.codUsuario = u_cli.codUsuario
      LEFT JOIN usuario u_est ON p.codEstofador = u_est.codUsuario
      WHERE p.status IN ('Pronto', 'Entregue')
      ORDER BY p.codPedido DESC
    `);

    res.render("admin/producao", {
      usuario: req.session.usuario,
      pedidosProducao,
    });
  } catch (error) {
    console.error("Erro ao listar pedidos concluídos:", error);
    res.status(500).send("Erro interno ao carregar a página.");
  }
});

// Rota para listar os trabalhos de um estofador específico (Apenas para Admin)
app.get(
  "/admin/estofador/:id/trabalhos",
  verificarAutenticacao(["admin"]),
  async (req, res) => {
    if (req.session.usuario.tipo !== "admin") return res.redirect("/login");

    try {
      const idEstofador = req.params.id;

      // 1. Busca os dados do estofador para mostrar o nome dele no título da página
      const [dadosProfissional] = await db.query(
        "SELECT nome FROM usuario WHERE codUsuario = ? AND tipo = 'estofador'",
        [idEstofador],
      );

      if (dadosProfissional.length === 0)
        return res.status(404).send("Profissional não encontrado.");
      const estofador = dadosProfissional[0];

      // 2. Busca todas as ordens de serviço atribuídas a este estofador
      const [trabalhos] = await db.query(
        `
      SELECT p.codPedido, p.dataPedido, p.status, u.nome AS nomeCliente
      FROM pedido p
      INNER JOIN cliente c ON p.codCliente = c.codCliente
      INNER JOIN usuario u ON c.codUsuario = u.codUsuario
      WHERE p.codEstofador = ?
      ORDER BY p.dataPedido DESC
    `,
        [idEstofador],
      );

      // 3. Renderiza uma nova página com a lista de trabalhos do profissional
      res.render("admin/estofador-trabalhos", {
        usuario: req.session.usuario,
        estofador: estofador,
        trabalhos: trabalhos,
      });
    } catch (error) {
      console.error("Erro ao buscar histórico do estofador:", error);
      res.status(500).send("Erro interno do servidor.");
    }
  },
);

// Rota Estofador - Detalhes do Pedido para Análise (Apenas para o estofador responsável pelo pedido)
app.get(
  "/estofador/pedido/:id/detalhes",
  verificarAutenticacao(["estofador"]),
  async (req, res) => {
    if (req.session.usuario.tipo !== "estofador") return res.redirect("/login");

    try {
      const idPedido = req.params.id;

      // Busca o pedido no banco garantindo que pertença a este estofador
      const [pedidos] = await db.query(
        `
      SELECT p.*, u.nome AS nomeCliente, u.email AS emailCliente 
      FROM pedido p
      INNER JOIN cliente c ON p.codCliente = c.codCliente
      INNER JOIN usuario u ON c.codUsuario = u.codUsuario
      WHERE p.codPedido = ? AND p.codEstofador = ?
    `,
        [idPedido, req.session.usuario.codUsuario],
      );

      if (pedidos.length === 0)
        return res
          .status(404)
          .send("Pedido não encontrado ou não atribuído a você.");
      let pedido = pedidos[0];

      // Busca os produtos vinculados ao pedido
      const [itens] = await db.query(
        `
      SELECT ip.quantidade, ip.observacao AS observacaoProduto, prod.nome AS nomeProduto 
      FROM itempedido ip
      INNER JOIN produto prod ON ip.codProduto = prod.codProduto
      WHERE ip.codPedido = ?
    `,
        [idPedido],
      );
      pedido.itens = itens;

      // RENDERIZAÇÃO: Mantém o caminho da sua pasta views/estofador/analisa-pedido.ejs
      res.render("estofador/analisa-pedido", {
        usuario: req.session.usuario,
        pedido: pedido,
      });
    } catch (error) {
      console.error("Erro ao carregar detalhes:", error);
      res.status(500).send("Erro interno do servidor.");
    }
  },
);

// LOGOUT - Rota para Encerrar a Sessão do Usuário
app.get("/logout", (req, res) => {
  // Destrói a sessão no servidor
  req.session.destroy((err) => {
    if (err) {
      console.error("Erro ao destruir a sessão:", err);
      return res.status(500).send("Erro ao sair do sistema.");
    }
    // Limpa o cookie do navegador por segurança
    res.clearCookie("connect.sid");

    // Manda o usuário de volta para a tela de login
    res.redirect("/login");
  });
});

// ROTA: Visão do Admin para Analisar o Trabalho do Estofador
app.get(
  "/admin/estofador-analisa/:id",
  verificarAutenticacao(["admin"]),
  async (req, res) => {
    // 1. Garante que apenas o Administrador/Gerente pode aceder
    if (req.session.usuario.tipo !== "admin") {
      return res.redirect("/login");
    }

    try {
      const idPedido = req.params.id;

      // 2. Busca os dados do pedido, do cliente e também o nome do estofador atribuído
      const [pedidos] = await db.query(
        `
      SELECT p.*, 
             u_cli.nome AS nomeCliente, u_cli.email AS emailCliente,
             u_est.nome AS nomeEstofador
      FROM pedido p
      INNER JOIN cliente c ON p.codCliente = c.codCliente
      INNER JOIN usuario u_cli ON c.codUsuario = u_cli.codUsuario
      LEFT JOIN usuario u_est ON p.codEstofador = u_est.codUsuario
      WHERE p.codPedido = ?
    `,
        [idPedido],
      );

      if (pedidos.length === 0) {
        return res.status(404).send("Pedido não encontrado.");
      }

      let pedido = pedidos[0];

      // 3. Busca os produtos, quantidades e observações do pedido
      const [itens] = await db.query(
        `
      SELECT ip.quantidade, ip.observacao AS observacaoProduto, prod.nome AS nomeProduto 
      FROM itempedido ip
      INNER JOIN produto prod ON ip.codProduto = prod.codProduto
      WHERE ip.codPedido = ?
    `,
        [idPedido],
      );

      pedido.itens = itens;

      // 4. RENDERIZAÇÃO: Aponta para a pasta "admin" e abre o ficheiro "estofador-analisa"
      // Lembra-te de criar o ficheiro "estofador-analisa.ejs" dentro da pasta "pages/admin/"
      res.render("admin/estofador-analisa", {
        usuario: req.session.usuario,
        pedido: pedido,
      });
    } catch (error) {
      console.error("Erro ao carregar estofador-analisa para o admin:", error);
      res.status(500).send("Erro interno do servidor.");
    }
  },
);

// Rota para carrinho
app.get("/carrinho", async (req, res) => {
    const usuarioLogado = req.session.usuario || null;
    const itensCarrinho = req.session.carrinho || [];

    try {
        // Se o carrinho estiver vazio, renderiza a página com lista vazia
        if (itensCarrinho.length === 0) {
            return res.render("carrinho", { 
                usuario: usuarioLogado, 
                produtosNoCarrinho: [], 
                total: 0 
            });
        }

        // Extrai apenas os IDs dos produtos do carrinho para fazer uma única busca no banco
        const ids = itensCarrinho.map(item => item.id);

        // Busca no banco apenas os produtos que o usuário adicionou no carrinho
        // O "IN (?)" resolve a busca de vários IDs de uma vez só
        const [produtosDoBanco] = await db.query("SELECT * FROM produto WHERE codProduto IN (?)", [ids]);

        // Junta os dados do banco (nome, preco, imagem) com a quantidade da sessão
        let total = 0;
        const produtosNoCarrinho = produtosDoBanco.map(produto => {
            const itemSessao = itensCarrinho.find(item => Number(item.id) === produto.codProduto);
            const quantidade = itemSessao ? itemSessao.quantidade : 1;
            const subtotal = produto.preco * quantidade;
            total += subtotal;

            return {
                codProduto: produto.codProduto,
                nome: produto.nome,
                preco: produto.preco,
                imagem: produto.imagem,
                quantidade: quantidade,
                subtotal: subtotal
            };
        });

        // Renderiza a página do carrinho enviando os produtos completos e o total
        res.render("carrinho", {
            usuario: usuarioLogado,
            produtosNoCarrinho: produtosNoCarrinho,
            total: total
        });

    } catch (error) {
        console.error("Erro ao carregar o carrinho:", error);
        res.status(500).send("Erro interno ao carregar o carrinho.");
    }
});

// Rota para adicionar um produto ao carrinho (via POST)
app.post("/pedido/finalizar", async (req, res) => {
    if (!req.session.usuario) {
        return res.redirect("/login");
    }

    const itensCarrinho = req.session.carrinho || [];
    if (itensCarrinho.length === 0) {
        return res.redirect("/produtos");
    }

    try {
        // 1. Pegamos o ID do cliente logado. 
        // Nota: Certifique-se de ter o codCliente salvo na sessão quando o usuário faz login.
        const codCliente = req.session.usuario.codCliente; 
        const dataAtual = new Date();

        // 2. Insere o registro principal na tabela 'pedido'
        const queryPedido = "INSERT INTO pedido (codCliente, dataPedido, status) VALUES (?, ?, 'Aberto')";
        const [resultadoPedido] = await db.query(queryPedido, [codCliente, dataAtual]);
        
        // Recupera o ID do pedido que o MySQL acabou de gerar automaticamente
        const novoCodPedido = resultadoPedido.insertId;

        // 3. Insere cada item do carrinho na tabela de associação de itens do pedido
        // É recomendável ter uma tabela como 'itemPedido' com: codPedido, codProduto, quantidade
        const queryItem = "INSERT INTO itemPedido (codPedido, codProduto, quantidade) VALUES (?, ?, ?)";
        
        for (const item of itensCarrinho) {
            await db.query(queryItem, [novoCodPedido, item.id, item.quantidade]);
        }

        // 4. Pedido feito com sucesso! Agora limpamos o carrinho da sessão
        req.session.carrinho = [];

        // Redireciona para uma página de sucesso ou para o painel do cliente acompanhar
        res.redirect("/client-dashboard?pedidoSucesso=true");

    } catch (error) {
        console.error("Erro ao finalizar pedido:", error);
        res.status(500).send("Erro ao processar o seu pedido.");
    }
});

// Rota para atualizar o status do pedido
app.post(
  "/admin/pedido/:id/status",
  verificarAutenticacao(["admin"]),
  async (req, res) => {
    const idPedido = req.params.id;
    const { novoStatus, codEstofador } = req.body;
    const tipoUsuario = req.session.usuario.tipo;

    // LINHA PARA DIAGNÓSTICO:
    console.log("Dados recebidos no POST:", {
      idPedido,
      novoStatus,
      codEstofador,
      tipoUsuario,
    });

    const statusValidos = [
      "Aberto",
      "Pago",
      "Em Produção",
      "Pronto",
      "Entregue",
      "Cancelado",
    ];
    if (!statusValidos.includes(novoStatus)) {
      return res.status(400).send("Status inválido.");
    }

    try {
      if (novoStatus === "Em Produção") {
        if (!codEstofador) {
          return res.status(400).send("É obrigatório atribuir um estofador.");
        }
        await db.query(
          "UPDATE pedido SET status = ?, codEstofador = ? WHERE codPedido = ?",
          [novoStatus, codEstofador, idPedido],
        );
      } else {
        await db.query("UPDATE pedido SET status = ? WHERE codPedido = ?", [
          novoStatus,
          idPedido,
        ]);
      }

      console.log(
        `📦 Pedido #${idPedido} atualizado para [${novoStatus}] por um [${tipoUsuario}].`,
      );

      // 1. Se quem atualizou foi o estofador, ele sempre volta para a bancada dele
      if (tipoUsuario === "estofador") {
        return res.redirect("/estofador-dashboard");
      }
      // 2. Se quem atualizou foi o admin, depende do status para onde ele vai
      else if (tipoUsuario === "admin") {
        if (["Em Produção", "Pronto", "Entregue"].includes(novoStatus)) {
          // Se mudou para produção ou finalizou, mantém o admin na página de produção/concluídos
          return res.redirect("/admin/producao");
        } else {
          // Se mudou para qualquer outro status (ex: Aberto/Cancelado), vai para o painel geral
          return res.redirect("/admin-dashboard");
        }
      }
      // 3. Segurança: se por acaso um cliente cair aqui, vai para a área dele
      else {
        return res.redirect("/");
      }
    } catch (error) {
      console.error("Erro ao processar o status do pedido:", error);
      res.status(500).send("Erro interno ao atualizar o pedido.");
    }
  },
);

// Rota para excluir um estofador (Apenas para Admin)
app.post(
  "/admin/estofador/:id/excluir",
  verificarAutenticacao(["admin"]),
  async (req, res) => {
    if (req.session.usuario.tipo !== "admin") {
      return res.redirect("/client-dashboard");
    }

    const idEstofador = req.params.id;

    try {
      await db.query(
        "UPDATE pedido SET codEstofador = NULL WHERE codEstofador = ?",
        [idEstofador],
      );

      await db.query(
        "DELETE FROM usuario WHERE codUsuario = ? AND tipo = 'estofador'",
        [idEstofador],
      );

      console.log(`🗑️ Estofador ID #${idEstofador} foi removido do sistema.`);
      res.redirect("/admin/estofadores");
    } catch (error) {
      console.error("Erro ao remover estofador:", error);
      res.status(500).send("Erro interno ao tentar remover o estofador.");
    }
  },
);

// Rota para cadastrar um Novo Estofador
app.post("/admin/estofador/novo", verificarAutenticacao(["admin"]), async (req, res) => {
  if (req.session.usuario.tipo !== "admin") {
    return res.redirect("/client-dashboard");
  }

  const { nome, email } = req.body;
  const senhaPadrao = "123456";

  try {
    await db.query(
      "INSERT INTO usuario (nome, email, senha, tipo) VALUES (?, ?, ?, 'estofador')",
      [nome, email, senhaPadrao],
    );

    console.log(`👤 Novo estofador cadastrado: ${nome}`);
    res.redirect("/admin/estofadores");
  } catch (error) {
    console.error("Erro ao cadastrar estofador:", error);
    res.status(500).send("Erro interno ao salvar estofador.");
  }
});

// Rota para Salvar a Edição do Estofador
app.post(
  "/admin/estofador/:id/editar",
  verificarAutenticacao(["admin"]),
  async (req, res) => {
    if (req.session.usuario.tipo !== "admin") {
      return res.redirect("/client-dashboard");
    }

    const idEstofador = req.params.id;
    const { nome, email } = req.body;

    try {
      await db.query(
        "UPDATE usuario SET nome = ?, email = ? WHERE codUsuario = ? AND tipo = 'estofador'",
        [nome, email, idEstofador],
      );

      console.log(`✏️ Estofador ID #${idEstofador} atualizado para: ${nome}`);
      res.redirect("/admin/estofadores");
    } catch (error) {
      console.error("Erro ao atualizar estofador:", error);
      res.status(500).send("Erro interno ao atualizar dados do estofador.");
    }
  },
);

// Painel do Estofador (Protegido)
app.get("/estofador-dashboard", verificarAutenticacao(["estofador"]), async (req, res) => {
  if (req.session.usuario.tipo !== "estofador") {
    return res.redirect("/login");
  }

  const idEstofador = req.session.usuario.codUsuario;

  try {
    const [[{ totalIniciados }]] = await db.query(
      "SELECT COUNT(*) AS totalIniciados FROM pedido WHERE codEstofador = ? AND status = 'Em Produção'",
      [idEstofador],
    );

    const [[{ totalConcluidos }]] = await db.query(
      "SELECT COUNT(*) AS totalConcluidos FROM pedido WHERE codEstofador = ? AND status IN ('Pronto', 'Entregue')",
      [idEstofador],
    );

    const [[{ totalCancelados }]] = await db.query(
      "SELECT COUNT(*) AS totalCancelados FROM pedido WHERE codEstofador = ? AND status = 'Cancelado'",
      [idEstofador],
    );

    const [ordens] = await db.query(
      `
      SELECT 
          p.codPedido,
          u_cli.nome AS nomeCliente,
          p.dataPedido,
          p.status
      FROM pedido p
      INNER JOIN cliente c ON p.codCliente = c.codCliente
      INNER JOIN usuario u_cli ON c.codUsuario = u_cli.codUsuario
      WHERE p.codEstofador = ?
      ORDER BY p.codPedido DESC
    `,
      [idEstofador],
    );

    res.render("estofador/estofador-dashboard", {
      usuario: req.session.usuario,
      indicadores: {
        iniciados: totalIniciados,
        concluidos: totalConcluidos,
        cancelados: totalCancelados,
      },
      ordens: ordens,
    });
  } catch (error) {
    console.error("Erro ao carregar painel do estofador:", error);
    res.status(500).send("Erro interno ao carregar o painel.");
  }
});

// Painel do Cliente (Protegido)
app.get("/client-dashboard", verificarAutenticacao(["cliente"]), (req, res) => {
  // Passamos o objeto usuario para dentro do EJS
  res.render("client/client-dashboard", {
    usuario: req.session.usuario,
  });
});

// Painel de Perfil do Cliente
app.get("/perfil", verificarAutenticacao(["cliente"]), async (req, res) => {
  const usuarioLogado = req.session.usuario;

  try {
    const [dadosUsuario] = await db.query(
      `
      SELECT u.codUsuario, u.nome, u.email, c.telefone, c.endereco, c.codCliente 
      FROM usuario u
      LEFT JOIN cliente c ON u.codUsuario = c.codUsuario
      WHERE u.codUsuario = ?
    `,
      [usuarioLogado.codUsuario],
    );

    const perfilCompleto = dadosUsuario[0];
    let pedidos = [];

    if (perfilCompleto && perfilCompleto.codCliente) {
      const [listaPedidos] = await db.query(
        `
        SELECT p.codPedido, p.dataPedido, p.status, pag.valor AS valor_final 
        FROM pedido p
        LEFT JOIN pagamento pag ON p.codPedido = pag.codPedido
        WHERE p.codCliente = ? 
        ORDER BY p.dataPedido DESC
      `,
        [perfilCompleto.codCliente],
      );
      pedidos = listaPedidos;
    }

    const erroUrl = req.query.error;
    let mensagemErro = null;

    if (erroUrl === "senhas_diferentes") {
      mensagemErro = "As senhas digitadas não coincidem. Tente novamente.";
    } else if (erroUrl === "senha_curta") {
      mensagemErro = "A nova senha deve conter no mínimo 8 caracteres.";
    }

    res.render("client/perfil", {
      usuario: {
        nome: perfilCompleto?.nome || "Nome não cadastrado",
        email: perfilCompleto?.email || "E-mail não cadastrado",
        telefone: perfilCompleto?.telefone || "",
        endereco: perfilCompleto?.endereco || "",
      },
      pedidos: pedidos,
      error: mensagemErro,
    });
  } catch (error) {
    console.error("Erro ao carregar dados do perfil:", error);
    res.status(500).send("Erro interno do servidor.");
  }
});

// ==========================================
// 3. IMPORTAÇÃO DE ROTAS EXTERNAS
// ==========================================
const clientRoutes = require("./BackEnd/src/routes/UsuarioRoutes");
app.use("/", clientRoutes);

// ==========================================
// 4. ROTAS POST (Processamento de Dados)
// ==========================================

// Rota de Login
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    // 1. Buscamos o usuário APENAS pelo e-mail
    const [usuarios] = await db.query(
      "SELECT codUsuario, nome, email, senha, tipo FROM usuario WHERE email = ?",
      [email],
    );

    const usuarioEncontrado = usuarios[0];

    // 2. Se o usuário existir, comparamos a senha digitada com a criptografada
    if (usuarioEncontrado) {
      const senhaCorreta = await bcrypt.compare(password, usuarioEncontrado.senha);

      if (senhaCorreta) {
        // 3. Senha correta! Geramos o token JWT com os dados do usuário
        const token = jwt.sign(
          { id: usuarioEncontrado.codUsuario, tipo: usuarioEncontrado.tipo },
          SECRET_KEY,
          { expiresIn: '1d' } // Expira em 1 dia
        );

        // 4. Guardamos o usuário e o token na sessão para controle do servidor
        req.session.usuario = {
          codUsuario: usuarioEncontrado.codUsuario,
          nome: usuarioEncontrado.nome,
          email: usuarioEncontrado.email,
          tipo: usuarioEncontrado.tipo,
          token: token // Opcional: token salvo na sessão para checagens futuras
        };

        // Seu switch original para redirecionar conforme o cargo
        switch (usuarioEncontrado.tipo) {
          case "admin":
            return res.redirect("/admin-dashboard");
          case "estofador":
            return res.redirect("/estofador-dashboard");
          case "cliente":
            return res.redirect("/client-dashboard");
          default:
            return res.redirect("/");
        }
      }
    }

    // Se o usuário não existir OU a senha estiver errada, cai aqui:
    return res.render("login", {
      usuario: req.session.usuario || null,
      error: "Email ou senha incorretos. Verifique os dados e tente novamente.",
    });

  } catch (error) {
    console.error("Erro no processamento do login:", error);
    return res.render("login", {
      usuario: req.session.usuario || null,
      error: "Erro interno ao conectar com o serviço de autenticação.",
    });
  }
});

// Rota de Registro de Clientes
app.post("/register", async (req, res) => {
  const { nome, email, novaSenha, telefone, endereco } = req.body;

  if (
    !nome?.trim() ||
    !email?.trim() ||
    !novaSenha?.trim() ||
    !telefone?.trim() ||
    !endereco?.trim()
  ) {
    return res.render("register", {
      usuario: req.session.usuario || null, // Garante que a variável exista na view se necessário
      error: "Por favor, preencha todos os campos. Espaços em branco não são válidos.",
    });
  }

  try {
    const [emailExistente] = await db.query(
      "SELECT codUsuario FROM usuario WHERE email = ?",
      [email],
    );
    if (emailExistente.length > 0) {
      return res.render("register", {
        usuario: req.session.usuario || null,
        error: "Este e-mail já está em uso. Tente outro ou faça login.",
      });
    }

    // 🌟 MUDANÇA AQUI: Criptografa a senha antes de mandar para o banco
    const senhaCriptografada = await bcrypt.hash(novaSenha, 10);

    // 🌟 MUDANÇA AQUI: Passamos 'senhaCriptografada' no lugar de 'novaSenha'
    const [resultadoUsuario] = await db.query(
      "INSERT INTO usuario (nome, email, senha) VALUES (?, ?, ?)",
      [nome, email, senhaCriptografada],
    );

    const novoCodUsuario = resultadoUsuario.insertId;

    await db.query(
      "INSERT INTO cliente (codUsuario, telefone, endereco) VALUES (?, ?, ?)",
      [novoCodUsuario, telefone || null, endereco || null],
    );

    console.log(
      `🚀 Novo cliente cadastrado com sucesso! ID Usuário: ${novoCodUsuario}`,
    );
    return res.redirect("/login");
  } catch (error) {
    console.error("Erro no processamento do cadastro:", error);
    return res.render("register", {
      usuario: req.session.usuario || null,
      error: "Erro interno ao processar o seu cadastro. Tente novamente mais tarde.",
    });
  }
});

// Rota de Atualização de Perfil
app.post(
  "/cliente/atualizar-perfil",
  verificarAutenticacao(["cliente"]),
  async (req, res) => {
    const { nome, telefone, endereco, novaSenha, confirmarSenha } = req.body;
    const usuarioLogado = req.session.usuario;

    if (!nome?.trim()) {
      return res.status(400).send("O nome completo é obrigatório.");
    }

    try {
      await db.query("UPDATE usuario SET nome = ? WHERE codUsuario = ?", [
        nome,
        usuarioLogado.codUsuario,
      ]);

      await db.query(
        "UPDATE cliente SET telefone = ?, endereco = ? WHERE codUsuario = ?",
        [telefone || null, endereco || null, usuarioLogado.codUsuario],
      );

      req.session.usuario.nome = nome;

      if (novaSenha && novaSenha.trim() !== "") {
        if (novaSenha !== confirmarSenha) {
          return res.redirect("/perfil?error=senhas_diferentes");
        }
        if (novaSenha.length < 8) {
          return res.redirect("/perfil?error=senha_curta");
        }

        await db.query("UPDATE usuario SET senha = ? WHERE codUsuario = ?", [
          novaSenha,
          usuarioLogado.codUsuario,
        ]);
      }

      console.log(
        `✅ Perfil atualizado para o usuário ID: ${usuarioLogado.codUsuario}`,
      );
      return res.redirect("/perfil");
    } catch (error) {
      console.error("Erro ao atualizar perfil:", error);
      return res.status(500).send("Erro interno ao atualizar os dados.");
    }
  },
);

// Rota para adicionar o item ao carrinho de compras
app.post("/carrinho/add/:id", async (req, res) => {
    const produtoId = req.params.id;

    if (!req.session.usuario) {
        // Opcional: Obriga login ou avisa que precisa logar
        return res.redirect("/login");
    }

    // Lógica básica de sessão para armazenar os itens no carrinho temporário
    if (!req.session.carrinho) {
        req.session.carrinho = [];
    }

    // Verifica se o item já está no carrinho
    const itemExistente = req.session.carrinho.find(item => item.id === produtoId);
    if (itemExistente) {
        itemExistente.quantidade += 1;
    } else {
        req.session.carrinho.push({ id: produtoId, quantidade: 1 });
    }

    console.log("Carrinho Atual:", req.session.carrinho);
    
    // Redireciona de volta para a página que o usuário estava
    res.redirect("/produtos");
});

// ==========================================
// 5. INICIALIZAÇÃO DO SERVIDOR
// ==========================================
app.listen(PORT, () => {
  console.log(`=================================`);
  console.log(`🚀 Servidor rodando com sucesso!`);
  console.log(`🔗 Acesse: http://localhost:${PORT}`);
  console.log(`=================================`);
});
