# Gabbis Workspace Discord Bot

Bot multifuncional para Discord com sistema de proteção de voz e narração de texto (TTS).

## 🚀 Funcionalidades

- **Proteção de voz**: Desconecta automaticamente bots de som quando um usuário protegido entra em um canal
- **Janela de proteção**: Configurável (padrão: 2000ms)
- **Modos de proteção**: Instant (com cooldown) e Persistent (contínuo)
- **Narração de texto (TTS)**: Converte mensagens de texto em áudio usando Text-to-Speech
- **Múltiplos idiomas**: Suporte a 9 idiomas para narração
- **Persistência**: Configurações salvas em arquivo JSON
- **Comandos slash**: Interface fácil de usar

## 📋 Pré-requisitos

- Node.js v18 ou superior
- npm ou yarn
- Token do bot Discord
- Client ID do bot Discord

## 📦 Dependências Principais

- **discord.js** ^14.25.1 - Biblioteca principal do Discord
- **@discordjs/voice** ^0.19.0 - Sistema de voz do Discord
- **google-tts-api** ^2.0.2 - Geração de Text-to-Speech
- **opusscript** ^0.0.8 - Codec de áudio Opus (alternativa ao @discordjs/opus)
- **ffmpeg-static** ^5.3.0 - FFmpeg para processamento de áudio

## 🔧 Instalação

1. Clone o repositório:
```bash
git clone <seu-repositorio>
cd GabbisWorkspace
```

2. Instale as dependências:
```bash
npm install
```

3. Crie um arquivo `.env` na raiz do projeto:
```env
DISCORD_TOKEN=seu_token_aqui
CLIENT_ID=seu_client_id_aqui
```

4. Deploy dos comandos slash:
```bash
npm run deploy
```

5. Inicie o bot:
```bash
npm start
```

## 📝 Comandos

### 🔒 Comandos de Proteção (`/protect`)
**⚠️ Requer permissão de Administrador**

#### `/protect add`
Adiciona uma proteção para um usuário.
- `target`: Usuário que será protegido
- `trigger`: Bot/usuário que será desconectado
- `modo` (opcional): Modo de proteção - `instant` (padrão) ou `persistent`
- `cooldown` (opcional): Janela de proteção em segundos (1-10, padrão: 2, apenas para modo Instant)

#### `/protect remove`
Remove uma proteção existente.
- `target`: Usuário protegido
- `trigger`: Bot/usuário que será removido da proteção
- `modo` (opcional): Modo específico a remover (se não especificado, remove todos)

#### `/protect edit`
Edita uma proteção existente.
- `target`: Usuário protegido
- `trigger`: Bot/usuário da proteção
- `modo-atual`: Modo atual da proteção a editar
- `modo` (opcional): Novo modo de proteção
- `cooldown` (opcional): Novo cooldown em segundos

#### `/protect list`
Lista todas as proteções ativas no servidor.

#### `/protect stats`
Mostra estatísticas das proteções do servidor.

#### `/protect logs add`
Define o canal onde os logs de proteção aparecerão.
- `channel`: Canal de texto para logs

#### `/protect logs remove`
Remove o canal de logs configurado.

---

### 🎙️ Comandos de Narração (`/narrador`)
**✅ Disponível para todos os usuários**

#### `/narrador join`
Faz o bot entrar no canal de voz atual do usuário.

#### `/narrador leave`
Faz o bot sair do canal de voz atual.

#### `/narrador language`
Define o idioma de narração do usuário.
- `idioma`: Idioma para narração (pt-BR, en-US, es-ES, fr-FR, de-DE, it-IT, ja-JP, ko-KR, zh-CN)

#### `/narrador mensagem`
Narra uma mensagem de texto no canal de voz.
- `texto`: Texto a ser narrado (máximo: 500 caracteres)

**Nota:** O bot precisa estar conectado ao canal de voz (use `/narrador join` primeiro).

### 🌍 Idiomas Suportados para TTS

O comando `/narrador` suporta os seguintes idiomas:
- 🇧🇷 Português (Brasil) - `pt-BR`
- 🇺🇸 English (US) - `en-US`
- 🇪🇸 Español - `es-ES`
- 🇫🇷 Français - `fr-FR`
- 🇩🇪 Deutsch - `de-DE`
- 🇮🇹 Italiano - `it-IT`
- 🇯🇵 日本語 - `ja-JP`
- 🇰🇷 한국어 - `ko-KR`
- 🇨🇳 中文 - `zh-CN`

O idioma padrão é `pt-BR` e pode ser configurado por usuário usando `/narrador language`.

## 🖥️ Executando no VPS (Linux)

### Usando PM2 (Recomendado)

1. Instale o PM2 globalmente:
```bash
npm install -g pm2
```

2. Inicie o bot com PM2:
```bash
pm2 start src/index.js --name gabbis-bot
```

3. Salve a configuração do PM2:
```bash
pm2 save
pm2 startup
```

4. Comandos úteis do PM2:
```bash
pm2 logs gabbis-bot      # Ver logs
pm2 restart gabbis-bot   # Reiniciar
pm2 stop gabbis-bot      # Parar
pm2 status               # Status
```

### Usando systemd (Alternativa)

Crie um arquivo `/etc/systemd/system/gabbis-bot.service`:

```ini
[Unit]
Description=Gabbis Workspace Discord Bot
After=network.target

[Service]
Type=simple
User=seu_usuario
WorkingDirectory=/caminho/para/GabbisWorkspace
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Depois:
```bash
sudo systemctl enable gabbis-bot
sudo systemctl start gabbis-bot
sudo systemctl status gabbis-bot
```

## 📁 Estrutura do Projeto

```
GabbisWorkspace/
├── data/
│   ├── guildConfigs.json    # Configurações de servidores (gerado automaticamente)
│   └── userConfigs.json     # Configurações de usuários (idiomas TTS)
├── src/
│   ├── commands/            # Comandos slash
│   │   ├── narrador.js      # Comando de narração TTS
│   │   └── protect.js       # Comando de proteção
│   ├── events/              # Eventos do Discord
│   │   ├── interactionCreate.js  # Handler de comandos
│   │   └── voiceState.js        # Handler de eventos de voz
│   ├── state/               # Gerenciamento de estado
│   │   ├── guildConfigs.js  # Configurações por servidor
│   │   ├── userConfigs.js   # Configurações por usuário
│   │   └── voiceState.js    # Estado de conexões de voz
│   ├── utils/               # Utilitários
│   │   ├── logger.js        # Sistema de logs
│   │   ├── stats.js         # Estatísticas
│   │   ├── tts.js           # Geração de áudio TTS
│   │   └── voiceManager.js # Gerenciamento de conexões de voz
│   ├── config/              # Configurações
│   │   └── env.js           # Variáveis de ambiente
│   ├── client.js            # Cliente Discord
│   ├── index.js             # Entrada principal
│   └── deployCommands.js    # Deploy de comandos
├── .env                     # Variáveis de ambiente (não commitado)
├── .gitignore
└── package.json
```

## 🔒 Segurança e Permissões

### Permissões do Bot
O bot precisa das seguintes permissões no servidor:
- **Gerenciar Canais** (para comandos de proteção)
- **Conectar** (para entrar em canais de voz)
- **Falar** (para reproduzir áudio TTS)
- **Desconectar Membros** (para desconectar triggers em proteções)
- **Usar Comandos de Aplicação** (para comandos slash)

### Permissões de Comandos
- **`/protect`**: Requer permissão de **Administrador**
- **`/narrador`**: Disponível para **todos os usuários**

### Segurança
- Nunca commite o arquivo `.env` no Git
- Mantenha seu token seguro
- O diretório `data/` está no `.gitignore` por padrão

## 🐛 Troubleshooting

**Bot não responde aos comandos:**
- Verifique se executou `npm run deploy`
- Confirme que o bot tem permissões no servidor
- Verifique se o bot está online

**Erro ao conectar:**
- Verifique o token no `.env`
- Confirme que o bot está online no Discord Developer Portal

**Proteção não funciona:**
- Verifique se o bot tem permissão para desconectar membros
- Confirme que as proteções foram criadas com `/protect list`
- Verifique se você tem permissão de administrador (comandos `/protect` são apenas para admins)

**Narrador não funciona:**
- Certifique-se de estar em um canal de voz antes de usar `/narrador join`
- Verifique se o bot tem permissão para entrar e falar no canal
- Se o áudio não toca, verifique se o `opusscript` foi instalado corretamente (`npm install`)
- Textos muito longos são divididos automaticamente

**Erro ao instalar dependências:**
- Se `@discordjs/opus` falhar, não se preocupe - o `opusscript` é instalado automaticamente como alternativa
- Certifique-se de ter Node.js v18 ou superior

## 📄 Licença

ISC

