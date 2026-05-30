// ROTA DE USUÁRIO
const express = require('express');
const router = express.Router();

// Na barra de navegação parecerá apenas: localhost:3005/perfil
router.get('/perfil', (req, res) => {
    // Mas o Express renderiza o arquivo escondido na subpasta
    res.render('client/perfil', { usuario: req.session.usuario || null });
});

// Na barra de navegação parecerá apenas: localhost:3005/dashboard
router.get('/dashboard', (req, res) => {
    res.render('client/client-dashboard', { usuario: req.session.usuario || null });
});

module.exports = router;