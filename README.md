# Zap Negócios

Desenvolvido por **Ricardo Macari** — contato: macari@gmail.com

Mini CRM universal em extensão Chrome + backend PHP + MySQL para qualquer empresa ou segmento. Permite usar o WhatsApp Web como base operacional para gerenciar leads, negócios, tarefas e lembretes com banco de dados próprio, mantendo integração opcional com o Travel Flow CRM.

---

## Índice

- [Trilha 1 — Usuário da Chrome Store](#trilha-1--usuário-da-chrome-store)
- [Trilha 2 — Desenvolvedor / Auto-hospedagem](#trilha-2--desenvolvedor--auto-hospedagem)
- [Arquivos do projeto](#arquivos-do-projeto)
- [Estrutura da tabela](#estrutura-da-tabela)
- [Como usar a extensão](#como-usar-a-extensão)
- [Segurança](#segurança)
- [Compatibilidade](#compatibilidade)
- [Suporte](#suporte)

---

## Trilha 1 — Usuário da Chrome Store

Para quem instala a extensão pela loja e já tem acesso a um servidor com o backend instalado.

### Passo 1 — Instale a extensão

Acesse a [Chrome Web Store](https://chrome.google.com/webstore) e instale **Zap Negócios**.

### Passo 2 — Abra as configurações

Após instalar, clique com o **botão direito** no ícone da extensão na barra do Chrome e selecione **"Opções"**.

Ou acesse: `chrome://extensions` → Zap Negócios → **Detalhes** → **Opções de extensão**

### Passo 3 — Configure a conexão

Na página de Opções, preencha:

- **URL do servidor** — endereço completo da pasta do backend no servidor, ex: `https://seudominio.com/zap-negocios`
- **API Key** — chave da instalação, fornecida pelo administrador do servidor
- **Usuário e senha** — login individual criado por um admin ou owner

Clique em **Entrar** e depois em **Testar sessão** para confirmar que tudo está funcionando.

### Passo 4 — Pronto

Acesse um atendimento no Travel Flow CRM ou uma conversa no WhatsApp Web. O botão **Negócios** aparecerá no lado direito da tela. O clique no ícone da extensão também abre/fecha o painel nos dois sistemas.

---

## Trilha 2 — Desenvolvedor / Auto-hospedagem

Para quem quer instalar e hospedar o backend no próprio servidor e carregar a extensão em modo desenvolvedor.

### Parte A — Instalar o backend no servidor

#### 1. Suba os arquivos para o servidor

Crie uma pasta no servidor, por exemplo `/httpdocs/zap-negocios/`, e envie os seguintes arquivos:

```
db.php
db.conf          ← você vai criar este arquivo (veja abaixo)
get_negocios.php
save_negocio.php
delete_negocio.php
restore_negocio.php
sync_lead_identity.php
export_backup.php
audit_log.php
get_fields.php
add_field.php
remove_field.php
get_form_fields.php
save_field_config.php
login.php
logout.php
me.php
setup_owner.php
users.php
tasks.php
schema.sql
migrate_v2.sql
migrate_v3.sql
migrate_v4.sql
migrate_v5.sql
migrate_v6.sql
migrate_v7.sql
```

#### 2. Crie o banco de dados

Importe o `schema.sql` no seu banco MySQL:

```bash
mysql -u seu_usuario -p seu_banco < schema.sql
```

Se já tiver o banco instalado de uma versão anterior, use as migrações necessárias em ordem (`migrate_v2.sql`, `migrate_v3.sql`, `migrate_v4.sql`, `migrate_v5.sql`, `migrate_v6.sql` e `migrate_v7.sql`) em vez do `schema.sql`. Leia os comentários dos arquivos antes de executar.

#### 3. Crie o arquivo db.conf

Na mesma pasta do servidor, crie o arquivo `db.conf` com o seguinte conteúdo:

```
DB_HOST=localhost
DB_NAME=seu_banco
DB_USER=seu_usuario
DB_PASS=sua_senha
ALLOWED_ORIGIN=https://travelflow.tur.br,https://web.whatsapp.com
API_KEY=chave_da_instalacao
SETUP_KEY=chave_para_criar_o_primeiro_owner
```

> **Importante:** `db.conf` contém credenciais sensíveis. Nunca o envie para repositórios públicos ou o deixe acessível via browser. Configure seu servidor para bloquear o acesso direto a arquivos `.conf`.

#### 4. Gere as chaves

Gere duas chaves **diferentes** — uma para `API_KEY` e outra para `SETUP_KEY`:

```bash
openssl rand -hex 32
openssl rand -hex 32
```

Cole os resultados gerados no `db.conf`.

#### 5. Crie o primeiro usuário owner

Depois de executar `migrate_v5.sql`, abra no navegador:

```text
https://seudominio.com/zap-negocios/setup_owner.php
```

Preencha `API Key`, `Setup Key`, usuário, nome e senha. O formulário cria o primeiro usuário com permissão total.

Essa tela só funciona enquanto não existir um usuário `owner` ativo.

#### 6. Teste o login

```bash
curl -X POST "https://seudominio.com/zap-negocios/login.php" \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: sua_api_key" \
  -d '{"username":"ricardo","password":"senha_segura_aqui"}'
```

---

### Parte B — Carregar a extensão em modo desenvolvedor

#### 1. Baixe os arquivos da extensão

Faça o download ou clone o repositório em [github.com/rmacari/zap-negocios](https://github.com/rmacari/zap-negocios) e localize a pasta com os arquivos:

```
manifest.json
background.js
content.js
content.css
page-bridge.js
options.html
options.js
options.css
```

#### 2. Carregue no Chrome

1. Acesse `chrome://extensions/`
2. Ative **Modo do desenvolvedor** (canto superior direito)
3. Clique em **Carregar sem compactação**
4. Selecione a pasta com os arquivos da extensão

#### 3. Configure a extensão

Após carregar, clique com o **botão direito** no ícone da extensão → **Opções** e preencha:

- **URL do servidor** — a URL da pasta onde você subiu os arquivos PHP
- **API Key** — a mesma chave `API_KEY` definida no `db.conf`
- **Usuário e senha** — usuário criado no backend

Clique em **Entrar** e depois em **Testar sessão**.

---

## Arquivos do projeto

### Backend (servidor)

| Arquivo | Descrição |
|---|---|
| `schema.sql` | Cria a tabela `lead_negocios` do zero |
| `migrate_v2.sql` | Migra banco existente de versão anterior para v2 |
| `migrate_v3.sql` | Adiciona campos de acompanhamento e a tabela de configuração de campos |
| `migrate_v4.sql` | Adiciona telefone, plataforma de origem e suporte universal CRM/WhatsApp |
| `migrate_v5.sql` | Adiciona usuários, sessões e permissões |
| `migrate_v6.sql` | Adiciona tarefas, lembretes e notificações |
| `migrate_v7.sql` | Adiciona auditoria, backup/exportação e exclusão reversível de negócios |
| `db.conf.example` | Modelo do arquivo de configuração |
| `db.php` | Conexão PDO, CORS, autenticação, permissões e sanitização de colunas |
| `login.php` | Autentica usuário e cria sessão |
| `logout.php` | Encerra a sessão atual |
| `me.php` | Retorna o usuário logado |
| `setup_owner.php` | Cria o primeiro usuário owner usando `SETUP_KEY` |
| `users.php` | Lista, cria, desativa e redefine senha de usuários |
| `tasks.php` | Lista, cria, altera e notifica tarefas do lead |
| `get_negocios.php` | Lista negócios por `conversation_id`, telefone ou conversa de origem |
| `get_form_fields.php` | Lista campos do formulário com ordem, rótulo, tipo e opções |
| `save_negocio.php` | Cria ou atualiza um negócio *(requer editor, admin ou owner)* |
| `delete_negocio.php` | Move um negócio para a lixeira por ID *(requer admin ou owner)* |
| `restore_negocio.php` | Restaura um negócio excluído da lixeira *(requer admin ou owner)* |
| `sync_lead_identity.php` | Preenche automaticamente o telefone normalizado em negócios antigos do lead *(requer editor, admin ou owner)* |
| `export_backup.php` | Gera backup JSON dos dados operacionais, sem hashes de senha/sessão *(requer admin ou owner)* |
| `audit_log.php` | Lista eventos recentes de auditoria *(requer admin ou owner)* |
| `get_fields.php` | Lista campos e metadados administrativos *(requer admin ou owner)* |
| `save_field_config.php` | Salva ordem, rótulo, tipo e opções dos campos *(requer admin ou owner)* |
| `add_field.php` | Adiciona nova coluna e sua configuração visual *(requer admin ou owner)* |
| `remove_field.php` | Remove coluna personalizada da tabela *(requer admin ou owner)* |

### Extensão Chrome

| Arquivo | Descrição |
|---|---|
| `manifest.json` | Manifesto da extensão Chrome/Chromium |
| `background.js` | Clique no ícone: abre opções ou alterna o painel lateral |
| `options.html` | Página de configuração e login |
| `options.js` | Lógica de conexão, login e sessão |
| `options.css` | Estilos da página de configuração |
| `page-bridge.js` | Detecta mudanças de `conversationId` no Travel Flow CRM |
| `content.js` | Painel lateral universal: negócios, tarefas, formulário, campos e usuários |
| `content.css` | Estilos do painel lateral |

---

## Estrutura da tabela

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | BIGINT | Chave primária, auto increment |
| `conversation_id` | VARCHAR(191) | ID do atendimento no Travel Flow, mantido por compatibilidade |
| `source_platform` | VARCHAR(50) | Origem do lead, como `travel_flow` ou `whatsapp_web` |
| `source_conversation_id` | VARCHAR(191) | Identificador da conversa na plataforma de origem |
| `nome_lead` | VARCHAR(255) | Nome do lead (lido automaticamente do DOM) |
| `lead_phone` | VARCHAR(32) | Telefone normalizado do lead, usado como identificador universal |
| `email` | VARCHAR(255) | E-mail do lead |
| `destino` | VARCHAR(255) | Destino da viagem |
| `status_negocio` | VARCHAR(100) | Status comercial do negócio |
| `temperatura_lead` | VARCHAR(100) | Temperatura do lead: Frio, Morno ou Quente |
| `proximo_contato` | VARCHAR(100) | Próxima data de contato |
| `valor_estimado` | VARCHAR(100) | Valor estimado do negócio |
| `responsavel` | VARCHAR(255) | Responsável pelo acompanhamento |
| `data_viagem` | VARCHAR(100) | Data ou estimativa (texto livre) |
| `duracao_viagem` | VARCHAR(100) | Duração em dias/noites |
| `numero_viajantes` | VARCHAR(100) | Quantidade de viajantes |
| `idade_viajantes` | VARCHAR(255) | Idades dos viajantes |
| `cidade_origem` | VARCHAR(255) | Cidade de embarque |
| `orcamento` | VARCHAR(100) | Orçamento estimado |
| `tipo_compra` | VARCHAR(100) | Tipo de produto |
| `prioridade_valor` | VARCHAR(100) | Prioridade: Preço, Conforto, Luxo... |
| `quando_reservar` | VARCHAR(100) | Intenção de compra |
| `observacoes` | TEXT | Observações livres |
| `created_at` | TIMESTAMP | Data de criação (automático) |
| `updated_at` | TIMESTAMP | Última atualização (automático) |
| *(campos extras)* | VARCHAR(255) | Campos personalizados criados pela aba ⚙️ Campos |

Também há a tabela `lead_negocio_field_config`, usada para salvar no servidor a ordem, o rótulo, o tipo visual e as opções dos campos exibidos pela extensão.

A tabela `lead_tasks` armazena tarefas vinculadas ao lead, com título, observação, vencimento, prioridade, status, responsável e vínculo opcional com um negócio.

A tabela `zap_audit_log` registra ações sensíveis, como criação/edição/exclusão/restauração de negócios, alterações de tarefas, usuários, campos e exportação de backup.

O sistema de permissões usa `zap_users` e `zap_user_sessions`:

| Papel | Permissões |
|---|---|
| `viewer` | Consulta negócios, campos e tarefas |
| `editor` | Consulta, cria e altera negócios; cria, edita, conclui, reabre e cancela tarefas |
| `admin` | Permissões de editor, exclusão de negócios, campos, usuários viewer/editor e arquivamento/exclusão de tarefas |
| `owner` | Controle total, incluindo admins e owners |

---

## Como usar a extensão

### Aba 📋 Negócios

- Selecione um negócio existente no dropdown ou mantenha **Novo negócio**
- O campo **Nome do Lead** é preenchido automaticamente quando a página fornece essa informação
- O campo **Telefone do Lead** é capturado automaticamente quando o telefone está visível; no CRM, quando um negócio antigo ainda está sem telefone, a extensão preenche o telefone normalizado automaticamente no banco
- No WhatsApp Web, se o contato salvo mostrar apenas nome, preencha o telefone manualmente em um negócio e clique em **Salvar** para reforçar a base universal
- Use os campos de acompanhamento, como status, temperatura, próximo contato, valor estimado e responsável, para controlar melhor cada oportunidade
- Preencha os campos e clique **Salvar**
- Use **Excluir** para remover o negócio selecionado; esta ação exige usuário `admin` ou `owner` e pede confirmação
- Para `admin` e `owner`, a opção **Mostrar negócios excluídos** exibe itens na lixeira e permite usar **Restaurar**
- Use **Limpar** para voltar ao modo de criação
- Use **Recarregar** para buscar os dados atualizados do servidor
- Ao trocar, limpar ou recarregar com alterações não salvas, a extensão avisa antes de descartar o formulário

### Aba ✅ Tarefas

- Crie tarefas vinculadas ao lead e, opcionalmente, a um negócio específico
- Use modelos rápidos como **Retornar**, **Cotação**, **Pagamento**, **Documentos** e **Follow-up**
- Defina data/hora de lembrete, prioridade, responsável e observações
- A lista agrupa tarefas atrasadas, para hoje, próximas, sem prazo, concluídas e canceladas
- Usuários `editor`, `admin` e `owner` podem criar, editar, concluir, reabrir e cancelar tarefas
- Usuários `admin` e `owner` podem arquivar ou excluir tarefas permanentemente
- O Chrome exibe notificações para tarefas pendentes próximas do vencimento ou atrasadas

### Aba ⚙️ Campos

- Visualize os campos padrão (fixos) e os campos personalizados
- **Adicionar campo:** informe nome técnico, rótulo, tipo e opções quando for uma lista
- **Reordenar:** use as setas ↑ ↓ para alterar a ordem de exibição no formulário para todos os usuários
- **Renomear rótulo e tipo:** edite o nome exibido, o tipo visual e as opções e clique ✓ — salvo no servidor, sem renomear a coluna do banco
- **Remover campo personalizado:** remove a coluna do banco permanentemente (com aviso de perda de dados)

### Aba 👤 Usuários

- Visível apenas para usuários `admin` e `owner`
- Admins podem criar, desativar e redefinir senha de usuários `viewer` e `editor`
- Owners podem gerenciar todos os papéis
- A seção **Backup e auditoria** permite baixar um backup JSON e consultar eventos recentes

---

## Segurança

- As credenciais do banco (`DB_HOST`, `DB_USER`, `DB_PASS`) ficam **apenas no servidor** no arquivo `db.conf` — nunca são expostas na extensão ou no browser
- A extensão armazena URL do servidor, API Key e último usuário no `chrome.storage.sync`
- O token de sessão fica em `chrome.storage.local` e pode ser revogado no logout ou ao desativar usuário
- Ordem, rótulos, tipos e opções dos campos ficam no banco do servidor em `lead_negocio_field_config`
- **API Key** — chave da instalação, enviada no header `X-Api-Key`
- **Login de usuário** — controla permissões reais por token de sessão
- Usuários `viewer` não alteram dados; `editor` salva negócios e tarefas; `admin` exclui negócios, arquiva/exclui tarefas e gerencia campos/usuários comuns; `owner` tem controle total
- As comparações de chaves usam `hash_equals()` para evitar ataques de timing
- Nomes de colunas são sanitizados antes de qualquer `ALTER TABLE`
- Campos padrão do sistema não podem ser removidos via API
- Negócios são excluídos de forma reversível e podem ser restaurados por `admin` ou `owner`
- A auditoria registra ações sensíveis com usuário, data/hora, entidade e antes/depois quando aplicável
- O backup/exportação gera JSON operacional sem expor hashes de senha ou sessão
- O CORS aceita apenas a origem definida em `db.conf`
- Para usar Travel Flow CRM e WhatsApp Web ao mesmo tempo, `ALLOWED_ORIGIN` deve incluir `https://travelflow.tur.br,https://web.whatsapp.com`

---

## Compatibilidade

- Chrome 88+
- Edge 88+ (Chromium)
- Brave (Chromium)
- Opera 74+
- Opera GX

---

## Suporte

Para dúvidas sobre instalação ou funcionamento, verifique:

1. Se o backend está acessível via HTTPS
2. Se o `db.conf` tem as credenciais corretas e a `API_KEY` configurada
3. Se a tabela foi criada corretamente no banco
4. Se a URL, a API Key e o login nas Opções da extensão estão corretos
5. Se o console do navegador (F12) mostra erros de CORS ou conexão
6. Se o `conversationId` está presente no atendimento do CRM ou se uma conversa está aberta no WhatsApp Web
