// ========================================
// BUSREVIEW
// ========================================


// ========================================
// CONFIGURAÇÃO
// ========================================

const RAIO_KM = 2;

let usuarioLat = null;
let usuarioLon = null;

let usuarioMarker = null;
let raioCircle = null;

let pontosMarkers = [];

let notaAtual = 0;

let linhaEmAvaliacao = null;
let pontoEmAvaliacao = null;

let linhaReviewsAtual = null;
let pontoReviewsAtual = null;

let filtroReviewsAtual = 0;


// ========================================
// MAPA
// ========================================

const map = L.map("map").setView(
    [-23.5505, -46.6333],
    14
);


L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    {
        attribution:
            "© OpenStreetMap © CARTO",

        maxZoom: 19
    }
).addTo(map);


// ========================================
// ÍCONES
// ========================================

const userIcon = L.divIcon({

    className: "",

    html:
        `<div class="user-marker"></div>`,

    iconSize: [18, 18],

    iconAnchor: [9, 9]

});


const stopIcon = L.divIcon({

    className: "",

    html:
        `<div class="stop-marker"></div>`,

    iconSize: [20, 20],

    iconAnchor: [10, 10]

});


// ========================================
// SEGURANÇA DE TEXTO
// ========================================

function escaparHTML(texto) {

    return String(texto ?? "")

        .replaceAll(
            "&",
            "&amp;"
        )

        .replaceAll(
            "<",
            "&lt;"
        )

        .replaceAll(
            ">",
            "&gt;"
        )

        .replaceAll(
            '"',
            "&quot;"
        )

        .replaceAll(
            "'",
            "&#039;"
        );

}


// ========================================
// ID ÚNICO DA LINHA
// ========================================

function chaveDaLinha(linha) {

    return String(
        linha.letreiro ||
        linha.codigo ||
        "linha"
    );

}


// ========================================
// BANCO LOCAL DAS REVIEWS
// ========================================

function carregarAvaliacoes() {

    try {

        const dados =
            localStorage.getItem(
                "busreview_avaliacoes"
            );

        const lista =
            JSON.parse(
                dados || "[]"
            );

        return Array.isArray(lista)
            ? lista
            : [];

    }

    catch (erro) {

        console.error(
            "Erro ao carregar avaliações:",
            erro
        );

        return [];

    }

}


function salvarAvaliacoes(lista) {

    localStorage.setItem(
        "busreview_avaliacoes",
        JSON.stringify(lista)
    );

}


// ========================================
// PEGAR REVIEWS DE UMA LINHA
// ========================================

function reviewsDaLinha(linha) {

    const chave =
        chaveDaLinha(linha);


    return carregarAvaliacoes()
        .filter(
            review =>
                String(
                    review.linha
                ) === chave
        )
        .sort(
            (a, b) =>
                new Date(b.data) -
                new Date(a.data)
        );

}


// ========================================
// MÉDIA
// ========================================

function calcularMediaReviews(
    reviews
) {

    if (!reviews.length) {
        return 0;
    }


    const soma =
        reviews.reduce(
            (
                total,
                review
            ) => {

                return total +
                    Number(
                        review.nota || 0
                    );

            },
            0
        );


    return soma /
        reviews.length;

}


// ========================================
// ESTRELAS
// ========================================

function estrelasHTML(nota) {

    const arredondada =
        Math.round(
            Number(nota) || 0
        );


    let resultado = "";


    for (
        let i = 1;
        i <= 5;
        i++
    ) {

        resultado +=
            i <= arredondada
                ? "★"
                : "☆";

    }


    return resultado;

}


// ========================================
// TEMPO ATÉ CHEGADA
// ========================================

function minutosAteHorario(
    horario
) {

    if (!horario) {
        return null;
    }


    const partes =
        horario.split(":");


    if (
        partes.length !== 2
    ) {
        return null;
    }


    const hora =
        Number(partes[0]);

    const minuto =
        Number(partes[1]);


    if (
        !Number.isFinite(hora) ||
        !Number.isFinite(minuto)
    ) {

        return null;

    }


    const agora =
        new Date();


    const chegada =
        new Date();


    chegada.setHours(
        hora,
        minuto,
        0,
        0
    );


    if (
        chegada.getTime() <
        agora.getTime() - 60000
    ) {

        chegada.setDate(
            chegada.getDate() + 1
        );

    }


    const diferenca =
        chegada.getTime() -
        agora.getTime();


    return Math.max(
        0,
        Math.round(
            diferenca /
            60000
        )
    );

}


// ========================================
// REMOVER MARCADORES
// ========================================

function removerPontos() {

    pontosMarkers.forEach(
        marker => {

            map.removeLayer(
                marker
            );

        }
    );


    pontosMarkers = [];

}


// ========================================
// BUSCAR PARADAS
// ========================================

async function criarPontosPerto() {

    if (
        usuarioLat === null ||
        usuarioLon === null
    ) {

        return;

    }


    removerPontos();


    console.log(
        "BUSCANDO PARADAS"
    );


    try {

        const resposta =
            await fetch(

                `/api/paradas?lat=${encodeURIComponent(usuarioLat)}&lon=${encodeURIComponent(usuarioLon)}`,

                {
                    cache: "no-store"
                }

            );


        if (!resposta.ok) {

            throw new Error(
                `HTTP ${resposta.status}`
            );

        }


        const pontos =
            await resposta.json();


        if (
            !Array.isArray(pontos)
        ) {

            throw new Error(
                "Resposta inválida."
            );

        }


        console.log(
            "TOTAL RECEBIDO DA API:",
            pontos.length
        );


        pontos.forEach(
            ponto => {

                const lat =
                    Number(ponto.py);

                const lon =
                    Number(ponto.px);


                if (
                    !Number.isFinite(lat) ||
                    !Number.isFinite(lon)
                ) {

                    return;

                }


                const marker =
                    L.marker(
                        [lat, lon],
                        {
                            icon: stopIcon
                        }
                    )
                    .addTo(map);


                marker.bindTooltip(

                    ponto.np ||
                    "Ponto de ônibus"

                );


                marker.on(
                    "click",
                    () => {

                        abrirPonto(
                            ponto
                        );

                    }
                );


                pontosMarkers.push(
                    marker
                );

            }
        );


        console.log(
            "TOTAL DE MARCADORES CRIADOS:",
            pontosMarkers.length
        );

    }

    catch (erro) {

        console.error(
            "Erro nas paradas:",
            erro
        );

    }

}


// ========================================
// LOCALIZAÇÃO
// ========================================

function atualizarLocalizacao(
    lat,
    lon
) {

    usuarioLat =
        Number(lat);

    usuarioLon =
        Number(lon);


    if (
        usuarioMarker
    ) {

        map.removeLayer(
            usuarioMarker
        );

    }


    if (
        raioCircle
    ) {

        map.removeLayer(
            raioCircle
        );

    }


    usuarioMarker =
        L.marker(
            [
                usuarioLat,
                usuarioLon
            ],
            {
                icon: userIcon,
                zIndexOffset: 1000
            }
        )
        .addTo(map);


    usuarioMarker.bindTooltip(
        "Você está aqui"
    );


    raioCircle =
        L.circle(
            [
                usuarioLat,
                usuarioLon
            ],
            {
                radius:
                    RAIO_KM * 1000,

                color:
                    "#5271ff",

                fillColor:
                    "#5271ff",

                fillOpacity:
                    0.06,

                weight: 2
            }
        )
        .addTo(map);


    map.setView(
        [
            usuarioLat,
            usuarioLon
        ],
        14
    );


    criarPontosPerto();

}


// ========================================
// GPS
// ========================================

function obterLocalizacaoReal() {

    if (
        !navigator.geolocation
    ) {

        alert(
            "Seu navegador não suporta localização."
        );

        return;

    }


    navigator.geolocation
        .getCurrentPosition(

            position => {

                console.log(
                    "LOCALIZAÇÃO REAL OBTIDA"
                );


                atualizarLocalizacao(

                    position.coords.latitude,

                    position.coords.longitude

                );

            },


            erro => {

                console.error(
                    "Erro de localização:",
                    erro
                );


                alert(
                    "Não foi possível acessar sua localização."
                );

            },


            {
                enableHighAccuracy: true,

                timeout: 20000,

                maximumAge: 0
            }

        );

}


// ========================================
// CENTRALIZAR
// ========================================

function centralizarUsuario() {

    if (
        usuarioLat === null ||
        usuarioLon === null
    ) {

        obterLocalizacaoReal();

        return;

    }


    map.setView(
        [
            usuarioLat,
            usuarioLon
        ],
        15
    );

}


// ========================================
// ABRIR PONTO
// ========================================

async function abrirPonto(
    ponto
) {

    const painel =
        document.getElementById(
            "painel-ponto"
        );


    const nome =
        document.getElementById(
            "painel-nome-ponto"
        );


    const endereco =
        document.getElementById(
            "painel-endereco-ponto"
        );


    const lista =
        document.getElementById(
            "lista-linhas-ponto"
        );


    painel?.classList.add(
        "aberto"
    );


    if (nome) {

        nome.textContent =
            ponto.np ||
            "Ponto de ônibus";

    }


    if (endereco) {

        endereco.textContent =
            ponto.ed ||
            "Endereço não informado";

    }


    if (lista) {

        lista.innerHTML = `

            <div class="carregando">
                Buscando linhas...
            </div>

        `;

    }


    buscarLinhasDoPonto(
        ponto
    );

}


// ========================================
// FECHAR PONTO
// ========================================

function fecharPainelPonto() {

    document
        .getElementById(
            "painel-ponto"
        )
        ?.classList
        .remove(
            "aberto"
        );

}


// ========================================
// BUSCAR LINHAS
// ========================================

async function buscarLinhasDoPonto(
    ponto
) {

    try {

        const resposta =
            await fetch(

                `/api/paradas/${ponto.cp}/linhas`,

                {
                    cache: "no-store"
                }

            );


        if (
            !resposta.ok
        ) {

            throw new Error(
                `HTTP ${resposta.status}`
            );

        }


        const dados =
            await resposta.json();


        mostrarLinhasDoPonto(

            dados.linhas || [],

            ponto

        );

    }

    catch (erro) {

        console.error(
            erro
        );


        const lista =
            document.getElementById(
                "lista-linhas-ponto"
            );


        if (lista) {

            lista.innerHTML = `

                <div class="carregando">
                    Não foi possível carregar as linhas.
                </div>

            `;

        }

    }

}


// ========================================
// MOSTRAR LINHAS
// ========================================

function mostrarLinhasDoPonto(
    linhas,
    ponto
) {

    const container =
        document.getElementById(
            "lista-linhas-ponto"
        );


    if (!container) {
        return;
    }


    container.innerHTML = "";


    if (!linhas.length) {

        container.innerHTML = `

            <div class="carregando">
                Nenhuma previsão disponível.
            </div>

        `;

        return;

    }


    linhas.forEach(
        linha => {

            const reviews =
                reviewsDaLinha(
                    linha
                );


            const media =
                calcularMediaReviews(
                    reviews
                );


            const previsoes =
                Array.isArray(
                    linha.previsoes
                )
                    ? linha.previsoes
                    : [];


            let previsoesHTML = "";


            previsoes
                .slice(0, 3)
                .forEach(
                    previsao => {

                        const horario =
                            previsao.horario ||
                            "--:--";


                        const minutos =
                            minutosAteHorario(
                                horario
                            );


                        const textoTempo =

                            minutos === null

                                ? ""

                                : minutos === 0

                                    ? "Chegando"

                                    : `${minutos} min`;


                        previsoesHTML += `

                            <div class="previsao-item">

                                <div>

                                    <div class="previsao-horario">
                                        ${escaparHTML(horario)}
                                    </div>

                                    <div class="previsao-label">
                                        Previsão de chegada
                                    </div>

                                </div>


                                <div class="previsao-minutos">
                                    ${escaparHTML(textoTempo)}
                                </div>

                            </div>

                        `;

                    }
                );


            if (!previsoesHTML) {

                previsoesHTML = `

                    <div class="carregando">
                        Sem previsão no momento.
                    </div>

                `;

            }


            const card =
                document.createElement(
                    "div"
                );


            card.className =
                "linha-onibus-card";


            card.innerHTML = `

                <div class="linha-cabecalho">

                    <div>

                        <div class="linha-numero">

                            ${escaparHTML(
                                linha.letreiro ||
                                linha.codigo ||
                                "Linha"
                            )}

                        </div>


                        <div class="linha-destino">

                            ${escaparHTML(
                                linha.destino ||
                                "Destino não informado"
                            )}

                        </div>

                    </div>


                    <div class="linha-qtd">

                        ${
                            Number(
                                linha.quantidadeVeiculos
                            ) ||
                            previsoes.length
                        }

                        ônibus

                    </div>

                </div>


                <div class="linha-avaliacao-resumo">

                    <span class="estrelas-pequenas">

                        ${
                            reviews.length
                                ? estrelasHTML(media)
                                : "☆☆☆☆☆"
                        }

                    </span>


                    <span class="nota-media">

                        ${
                            reviews.length
                                ? media.toFixed(1)
                                    .replace(".", ",")
                                : "Sem nota"
                        }

                    </span>


                    <span class="quantidade-avaliacoes">

                        ${
                            reviews.length
                        }

                        ${
                            reviews.length === 1
                                ? "avaliação"
                                : "avaliações"
                        }

                    </span>

                </div>


                <div class="titulo-previsoes">
                    PRÓXIMAS CHEGADAS
                </div>


                ${previsoesHTML}


                <div class="acoes-linha">

                    <button
                        type="button"
                        class="botao-reviews"
                    >
                        Ver avaliações
                    </button>


                    <button
                        type="button"
                        class="botao-avaliar"
                    >
                        Avaliar linha
                    </button>

                </div>

            `;


            card
                .querySelector(
                    ".botao-avaliar"
                )
                .addEventListener(
                    "click",
                    () => {

                        abrirModalAvaliacao(
                            linha,
                            ponto
                        );

                    }
                );


            card
                .querySelector(
                    ".botao-reviews"
                )
                .addEventListener(
                    "click",
                    () => {

                        abrirModalReviews(
                            linha,
                            ponto
                        );

                    }
                );


            container.appendChild(
                card
            );

        }
    );

}


// ========================================
// MODAL AVALIAÇÃO
// ========================================

function abrirModalAvaliacao(
    linha,
    ponto
) {

    linhaEmAvaliacao =
        linha;

    pontoEmAvaliacao =
        ponto;

    notaAtual = 0;


    document
        .getElementById(
            "tituloAvaliacao"
        )
        .textContent =

        `Avaliar linha ${
            linha.letreiro ||
            linha.codigo ||
            ""
        }`;


    document
        .getElementById(
            "subtituloAvaliacao"
        )
        .textContent =

        ponto.np ||
        ponto.ed ||
        "Ponto de ônibus";


    document
        .getElementById(
            "textoAvaliacao"
        )
        .value = "";


    document
        .getElementById(
            "lotacaoAvaliacao"
        )
        .value = "";


    document
        .getElementById(
            "atrasoAvaliacao"
        )
        .value = "";


    atualizarEstrelas();


    document
        .getElementById(
            "modalAvaliacao"
        )
        .classList
        .remove(
            "oculto"
        );

}


// ========================================
// FECHAR AVALIAÇÃO
// ========================================

function fecharModalAvaliacao() {

    document
        .getElementById(
            "modalAvaliacao"
        )
        ?.classList
        .add(
            "oculto"
        );

}


// ========================================
// NOTA
// ========================================

function definirNota(
    nota
) {

    notaAtual =
        Number(nota);


    atualizarEstrelas();

}


function atualizarEstrelas() {

    const botoes =
        document.querySelectorAll(
            "#estrelasAvaliacao button"
        );


    botoes.forEach(
        (
            botao,
            indice
        ) => {

            botao.classList.toggle(

                "ativa",

                indice <
                notaAtual

            );

        }
    );

}


// ========================================
// ENVIAR REVIEW
// ========================================

function enviarAvaliacao() {

    if (
        !linhaEmAvaliacao
    ) {
        return;
    }


    if (
        notaAtual < 1 ||
        notaAtual > 5
    ) {

        alert(
            "Escolha de 1 a 5 estrelas."
        );

        return;

    }


    const comentario =
        document
            .getElementById(
                "textoAvaliacao"
            )
            .value
            .trim();


    if (!comentario) {

        alert(
            "Escreva seu feedback."
        );

        return;

    }


    const lotacao =
        document
            .getElementById(
                "lotacaoAvaliacao"
            )
            .value;


    const atraso =
        document
            .getElementById(
                "atrasoAvaliacao"
            )
            .value;


    const reviews =
        carregarAvaliacoes();


    reviews.push({

        id:
            Date.now(),

        linha:
            chaveDaLinha(
                linhaEmAvaliacao
            ),

        destino:
            linhaEmAvaliacao.destino,

        ponto:
            pontoEmAvaliacao?.np,

        nota:
            notaAtual,

        comentario,

        lotacao,

        atraso,

        data:
            new Date()
                .toISOString()

    });


    salvarAvaliacoes(
        reviews
    );


    fecharModalAvaliacao();


    alert(
        "Avaliação publicada no BusReview."
    );


    mostrarLinhasDoPontoNovamente();


    if (
        linhaReviewsAtual &&
        chaveDaLinha(
            linhaReviewsAtual
        ) ===
        chaveDaLinha(
            linhaEmAvaliacao
        )
    ) {

        renderizarReviews();

    }

}


// ========================================
// RECARREGAR CARDS
// ========================================

async function mostrarLinhasDoPontoNovamente() {

    if (
        !pontoEmAvaliacao
    ) {
        return;
    }


    await buscarLinhasDoPonto(
        pontoEmAvaliacao
    );

}


// ========================================
// ABRIR REVIEWS
// ========================================

function abrirModalReviews(
    linha,
    ponto
) {

    linhaReviewsAtual =
        linha;

    pontoReviewsAtual =
        ponto;

    filtroReviewsAtual = 0;


    document
        .getElementById(
            "tituloReviews"
        )
        .textContent =

        `Avaliações da ${
            linha.letreiro ||
            linha.codigo ||
            "linha"
        }`;


    atualizarFiltroVisual();


    renderizarReviews();


    document
        .getElementById(
            "modalReviews"
        )
        .classList
        .remove(
            "oculto"
        );

}


// ========================================
// FECHAR REVIEWS
// ========================================

function fecharModalReviews() {

    document
        .getElementById(
            "modalReviews"
        )
        ?.classList
        .add(
            "oculto"
        );

}


// ========================================
// FILTRAR REVIEWS
// ========================================

function filtrarReviews(
    nota
) {

    filtroReviewsAtual =
        Number(nota);


    atualizarFiltroVisual();


    renderizarReviews();

}


// ========================================
// FILTRO VISUAL
// ========================================

function atualizarFiltroVisual() {

    document
        .querySelectorAll(
            "#filtrosReviews button"
        )
        .forEach(
            botao => {

                botao.classList.toggle(

                    "ativo",

                    Number(
                        botao.dataset.nota
                    ) ===
                    filtroReviewsAtual

                );

            }
        );

}


// ========================================
// RENDERIZAR REVIEWS
// ========================================

function renderizarReviews() {

    if (
        !linhaReviewsAtual
    ) {
        return;
    }


    const todas =
        reviewsDaLinha(
            linhaReviewsAtual
        );


    const media =
        calcularMediaReviews(
            todas
        );


    // MÉDIA

    document
        .getElementById(
            "reviewsMedia"
        )
        .textContent =

        todas.length

            ? media
                .toFixed(1)
                .replace(
                    ".",
                    ","
                )

            : "0,0";


    // ESTRELAS

    document
        .getElementById(
            "reviewsEstrelasMedia"
        )
        .textContent =

        estrelasHTML(
            media
        );


    // QUANTIDADE

    document
        .getElementById(
            "reviewsQuantidade"
        )
        .textContent =

        `${todas.length} ${
            todas.length === 1
                ? "avaliação"
                : "avaliações"
        }`;


    // ========================================
    // DISTRIBUIÇÃO
    // ========================================

    const distribuicao =
        document.getElementById(
            "reviewsDistribuicao"
        );


    distribuicao.innerHTML = "";


    for (
        let nota = 5;
        nota >= 1;
        nota--
    ) {

        const quantidade =
            todas.filter(
                review =>
                    Number(
                        review.nota
                    ) === nota
            ).length;


        const porcentagem =
            todas.length

                ? (
                    quantidade /
                    todas.length
                ) * 100

                : 0;


        distribuicao.innerHTML += `

            <div class="distribuicao-linha">

                <span>
                    ${nota}★
                </span>

                <div class="distribuicao-barra">

                    <div
                        class="distribuicao-preenchimento"
                        style="
                            width:${porcentagem}%;
                        "
                    ></div>

                </div>

                <span>
                    ${quantidade}
                </span>

            </div>

        `;

    }


    // ========================================
    // FILTRAGEM
    // ========================================

    const filtradas =

        filtroReviewsAtual === 0

            ? todas

            : todas.filter(
                review =>
                    Number(
                        review.nota
                    ) ===
                    filtroReviewsAtual
            );


    const lista =
        document.getElementById(
            "listaReviews"
        );


    lista.innerHTML = "";


    // ========================================
    // SEM REVIEWS
    // ========================================

    if (
        filtradas.length === 0
    ) {

        lista.innerHTML = `

            <div class="sem-reviews">

                <strong>
                    Nenhuma avaliação encontrada
                </strong>

                ${
                    todas.length === 0

                        ? "Seja a primeira pessoa a avaliar esta linha."

                        : "Não existem avaliações com essa quantidade de estrelas."
                }

            </div>

        `;

        return;

    }


    // ========================================
    // CADA REVIEW
    // ========================================

    filtradas.forEach(
        review => {

            const item =
                document.createElement(
                    "div"
                );


            item.className =
                "review-item";


            const data =
                new Date(
                    review.data
                );


            const dataTexto =
                data.toLocaleDateString(
                    "pt-BR"
                );


            let tags = "";


            if (
                review.lotacao
            ) {

                tags += `

                    <span class="review-tag">
                        Lotação: ${escaparHTML(review.lotacao)}
                    </span>

                `;

            }


            if (
                review.atraso
            ) {

                tags += `

                    <span class="review-tag">
                        Atraso: ${escaparHTML(review.atraso)}
                    </span>

                `;

            }


            item.innerHTML = `

                <div class="review-topo">

                    <div class="review-estrelas">

                        ${estrelasHTML(
                            review.nota
                        )}

                    </div>


                    <div class="review-data">

                        ${escaparHTML(
                            dataTexto
                        )}

                    </div>

                </div>


                <div class="review-comentario">

                    ${escaparHTML(
                        review.comentario
                    )}

                </div>


                ${
                    tags
                        ? `
                            <div class="review-tags">
                                ${tags}
                            </div>
                        `
                        : ""
                }

            `;


            lista.appendChild(
                item
            );

        }
    );

}


// ========================================
// AVALIAR PELO MODAL DE REVIEWS
// ========================================

function avaliarPeloModalReviews() {

    if (
        !linhaReviewsAtual
    ) {
        return;
    }


    const linha =
        linhaReviewsAtual;

    const ponto =
        pontoReviewsAtual;


    fecharModalReviews();


    abrirModalAvaliacao(
        linha,
        ponto
    );

}


// ========================================
// INICIAR
// ========================================

obterLocalizacaoReal();