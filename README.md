# Travel Flow Negócios

Desenvolvido por **Ricardo Macari** — contato: macari@gmail.com

Extensão Chrome + backend PHP + MySQL para salvar e gerenciar múltiplos negócios de leads diretamente no Travel Flow CRM, vinculados ao `conversationId` da URL do atendimento.

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

Acesse a [Chrome Web Store](https://chrome.google.com/webstore) e instale **Travel Flow Negócios**.

### Passo 2 — Abra as configurações

Após instalar, clique com o **botão direito** no ícone da extensão na barra do Chrome e selecione **"Opções"**.

Ou acesse: `chrome://extensions` → Travel Flow Negócios → **Detalhes** → **Opções de extensão**

### Passo 3 — Configure a conexão

Na página de Opções, preencha:

- **URL do servidor** — endereço completo da pasta do backend no servidor, ex: `https://seudominio.com/travelflow-negocios`
- **API Key** — chave fornecida pelo administrador do servidor
- **Admin Key** — *(opcional)* chave de administrador, fornecida apenas para quem pode gerenciar campos

Clique em **Salvar configurações** e depois em **Testar conexão** para confirmar que tudo está funcionando.

### Passo 4 — Pronto

Acesse um atendimento no Travel Flow CRM. O botão **Negócios** aparecerá no lado direito da tela. O clique no ícone da extensão também abre/fecha o painel quando você está em uma conversa do CRM.

---

## Trilha 2 — Desenvolvedor / Auto-hospedagem

Para quem quer instalar e hospedar o backend no próprio servidor e carregar a extensão em modo desenvolvedor.

### Parte A — Instalar o backend no servidor

#### 1. Suba os arquivos para o servidor

Crie uma pasta no servidor, por exemplo `/httpdocs/travelflow-negocios/`, e envie os seguintes arquivos:

```
db.php
db.conf          ← você vai criar este arquivo (veja abaixo)
get_negocios.php
save_negocio.php
delete_negocio.php
get_fields.php
add_field.php
remove_field.php
get_form_fields.php
save_field_config.php
schema.sql
migrate_v2.sql
migrate_v3.sql
```

#### 2. Crie o banco de dados

Importe o `schema.sql` no seu banco MySQL:

```bash
mysql -u seu_usuario -p seu_banco < schema.sql
```

Se já tiver o banco instalado de uma versão anterior, use `migrate_v2.sql` e depois `migrate_v3.sql` em vez do `schema.sql`. Leia os comentários dos arquivos antes de executar.

#### 3. Crie o arquivo db.conf

Na mesma pasta do servidor, crie o arquivo `db.conf` com o seguinte conteúdo:

```
DB_HOST=localhost
DB_NAME=seu_banco
DB_USER=seu_usuario
DB_PASS=sua_senha
ALLOWED_ORIGIN=https://travelflow.tur.br
API_KEY=chave_para_todos_os_usuarios
ADMIN_KEY=chave_somente_para_administradores
```

> **Importante:** `db.conf` contém credenciais sensíveis. Nunca o envie para repositórios públicos ou o deixe acessível via browser. Configure seu servidor para bloquear o acesso direto a arquivos `.conf`.

#### 4. Gere as chaves

Gere duas chaves **diferentes** — uma para `API_KEY` e outra para `ADMIN_KEY`:

```bash
openssl rand -hex 32
openssl rand -hex 32
```

Cole o resultado gerado no campo `API_KEY` do `db.conf`.

#### 5. Teste os endpoints

Use cURL para confirmar que o backend responde com a API Key:

```bash
curl -H "X-Api-Key: sua_api_key" \
  "https://seudominio.com/travelflow-negocios/get_negocios.php?conversation_id=teste"
```

Deve retornar: `{"success":true,"data":[]}`

Para testar os endpoints de gerenciamento de campos, use Postman ou cURL com o header `X-Admin-Key`:

```bash
curl -H "X-Admin-Key: sua_admin_key" \
  https://seudominio.com/travelflow-negocios/get_fields.php
```

---

### Parte B — Carregar a extensão em modo desenvolvedor

#### 1. Baixe os arquivos da extensão

Faça o download ou clone o repositório em [github.com/rmacari/travelflow-negocios](https://github.com/rmacari/travelflow-negocios) e localize a pasta com os arquivos:

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
- **Admin Key** — a mesma chave `ADMIN_KEY` definida no `db.conf` *(apenas para administradores)*

Clique em **Salvar configurações** e depois em **Testar conexão**.

---

## Arquivos do projeto

### Backend (servidor)

| Arquivo | Descrição |
|---|---|
| `schema.sql` | Cria a tabela `lead_negocios` do zero |
| `migrate_v2.sql` | Migra banco existente de versão anterior para v2 |
| `migrate_v3.sql` | Adiciona campos de acompanhamento e a tabela de configuração de campos |
| `db.conf.example` | Modelo do arquivo de configuração |
| `db.php` | Conexão PDO, CORS, validação de API Key e sanitização de colunas |
| `get_negocios.php` | Lista todos os negócios de um `conversation_id` |
| `get_form_fields.php` | Lista campos do formulário com ordem, rótulo, tipo e opções *(requer X-Api-Key)* |
| `save_negocio.php` | Cria ou atualiza um negócio |
| `delete_negocio.php` | Exclui um negócio por ID |
| `get_fields.php` | Lista campos e metadados administrativos *(requer X-Admin-Key)* |
| `save_field_config.php` | Salva ordem, rótulo, tipo e opções dos campos *(requer X-Admin-Key)* |
| `add_field.php` | Adiciona nova coluna e sua configuração visual *(requer X-Admin-Key)* |
| `remove_field.php` | Remove coluna personalizada da tabela *(requer X-Admin-Key)* |

### Extensão Chrome

| Arquivo | Descrição |
|---|---|
| `manifest.json` | Manifesto da extensão Chrome/Chromium |
| `background.js` | Clique no ícone: abre opções ou alterna o painel lateral |
| `options.html` | Página de configuração (URL do servidor e API Key) |
| `options.js` | Lógica de salvar/carregar configurações via chrome.storage.sync |
| `options.css` | Estilos da página de configuração |
| `page-bridge.js` | Detecta mudanças de `conversationId` no CRM |
| `content.js` | Painel lateral: negócios, formulário e configuração de campos |
| `content.css` | Estilos do painel lateral |

---

## Estrutura da tabela

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | BIGINT | Chave primária, auto increment |
| `conversation_id` | VARCHAR(191) | ID do atendimento no Travel Flow |
| `nome_lead` | VARCHAR(255) | Nome do lead (lido automaticamente do DOM) |
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

---

## Como usar a extensão

### Aba 📋 Negócios

- Selecione um negócio existente no dropdown ou mantenha **Novo negócio**
- O campo **Nome do Lead** é preenchido automaticamente da página
- Use os campos de acompanhamento, como status, temperatura, próximo contato, valor estimado e responsável, para controlar melhor cada oportunidade
- Preencha os campos e clique **Salvar**
- Use **Excluir** para remover o negócio selecionado (pede confirmação)
- Use **Limpar** para voltar ao modo de criação
- Use **Recarregar** para buscar os dados atualizados do servidor
- Ao trocar, limpar ou recarregar com alterações não salvas, a extensão avisa antes de descartar o formulário

### Aba ⚙️ Campos

- Visualize os campos padrão (fixos) e os campos personalizados
- **Adicionar campo:** informe nome técnico, rótulo, tipo e opções quando for uma lista
- **Reordenar:** use as setas ↑ ↓ para alterar a ordem de exibição no formulário para todos os usuários
- **Renomear rótulo e tipo:** edite o nome exibido, o tipo visual e as opções e clique ✓ — salvo no servidor, sem renomear a coluna do banco
- **Remover campo personalizado:** remove a coluna do banco permanentemente (com aviso de perda de dados)

---

## Segurança

- As credenciais do banco (`DB_HOST`, `DB_USER`, `DB_PASS`) ficam **apenas no servidor** no arquivo `db.conf` — nunca são expostas na extensão ou no browser
- A extensão armazena URL do servidor, API Key e Admin Key no `chrome.storage.sync`
- Ordem, rótulos, tipos e opções dos campos ficam no banco do servidor em `lead_negocio_field_config`
- **API Key** — usada por todos os usuários para operações normais (salvar, buscar, excluir negócios). Header: `X-Api-Key`
- **Admin Key** — usada exclusivamente para gerenciamento de campos (add_field, remove_field, get_fields, save_field_config). Header: `X-Admin-Key`. Deve ser diferente da API Key e compartilhada apenas com administradores
- Usuários sem Admin Key configurada não veem a aba ⚙️ Campos no painel
- As comparações de chaves usam `hash_equals()` para evitar ataques de timing
- Nomes de colunas são sanitizados antes de qualquer `ALTER TABLE`
- Campos padrão do sistema não podem ser removidos via API
- O CORS aceita apenas a origem definida em `db.conf`

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
4. Se a URL e a API Key nas Opções da extensão estão corretas
5. Se o console do navegador (F12) mostra erros de CORS ou conexão
6. Se o `conversationId` está presente na URL do atendimento
