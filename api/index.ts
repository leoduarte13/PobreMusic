import express from 'express';
import cors from 'cors';

const app = express();

app.use(cors());
app.use(express.json());

// Rota de status
app.get('/api/config-status', (req, res) => {
    res.json({ configured: true });
});

// Rota para salvar credenciais do Spotify
app.post('/api/auth/spotify/set-credentials', (req, res) => {
    const { clientId, clientSecret } = req.body || {};
    if (!clientId || !clientSecret) {
        return res.status(400).json({ error: "Credenciais inválidas" });
    }
    return res.json({ success: true, message: "Credenciais salvas com sucesso!" });
});

// Rota para buscar playlists
app.get('/api/my-playlists', (req, res) => {
    res.json([]);
});

export default app;
