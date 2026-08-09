
// ============================
// MAPA
// ============================

const map = L.map("map").setView(
    [-23.5505, -46.6333],
    13
);


L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    {
        attribution:
            "&copy; OpenStreetMap &copy; CARTO"
    }
).addTo(map);


// ============================
// PONTOS DE ÔNIBUS
// ============================

const pontos = [

    {
        nome: "Ponto Interlagos",
        lat: -23.7015,
        lon: -46.7020
    },

    {
        nome: "Ponto Autódromo",
        lat: -23.7035,
        lon: -46.6990
    },

    {
        nome: "Ponto Avenida",
        lat: -23.7060,
        lon: -46.7050
    }

];


pontos.forEach(ponto => {

    const marker = L.marker([
        ponto.lat,
        ponto.lon
    ]).addTo(map);

    marker.bindPopup(`
        <b>${ponto.nome}</b>
        <br>
        🚌 675A
        <br>
        🚌 6021
    `);

});


// ============================
// LINHAS
// ============================

const linhas = [

    {
        numero: "675A",

        tempo: 6,

        confiabilidade: 96,

        lotacao: "🟡 Cheio",

        status:
            "🟢 Operação normal"
    },

    {
        numero: "6021",

        tempo: 11,

        confiabilidade: 88,

        lotacao: "🟢 Normal",

        status:
            "🟢 Operação normal"
    },

    {
        numero: "637V",

        tempo: 18,

        confiabilidade: 61,

        lotacao: "🔴 Muito cheio",

        status:
            "🟠 Movimento acima do normal"
    }

];


// ============================
// MOSTRAR LINHAS
// ============================

function mostrarLinhas() {

    const lista =
        document.getElementById(
            "listaLinhas"
        );

    lista.innerHTML = "";


    linhas.forEach(linha => {

        const card =
            document.createElement(
                "div"
            );


        card.className =
            "linha-card";


        card.onclick = function() {

            abrirLinha(linha);

        };


        card.innerHTML = `

            <div class="linha-topo">

                <div class="numero">
                    ${linha.numero}
                </div>

                <div class="tempo">
                    ${linha.tempo} min
                </div>

            </div>

            <div class="status">

                ${linha.status}

                ·

                Confiabilidade:
                ${linha.confiabilidade}%

            </div>

        `;


        lista.appendChild(card);

    });

}


mostrarLinhas();


// ============================
// DESTINO
// ============================

function buscarDestino(destino) {

    alert(
        "Buscando melhores rotas para " +
        destino +
        "..."
    );

}


// ============================
// ABRIR LINHA
// ============================

function abrirLinha(linha) {

    document.getElementById(
        "detalhes"
    ).style.display = "block";


    document.getElementById(
        "linhaNome"
    ).textContent =
        linha.numero;


    document.getElementById(
        "linhaStatus"
    ).textContent =
        linha.status;


    document.getElementById(
        "tempo"
    ).textContent =
        linha.tempo + " min";


    document.getElementById(
        "confiabilidade"
    ).textContent =
        linha.confiabilidade + "%";


    document.getElementById(
        "lotacao"
    ).textContent =
        linha.lotacao;


    document.getElementById(
        "detalhes"
    ).scrollIntoView({
        behavior: "smooth"
    });

}


// ============================
// FECHAR DETALHES
// ============================

function fecharDetalhes() {

    document.getElementById(
        "detalhes"
    ).style.display = "none";

}


// ============================
// AVALIAÇÃO
// ============================

function avaliar(nota) {

    document.getElementById(
        "mensagemAvaliacao"
    ).textContent =
        "Obrigado! Você avaliou esta viagem com " +
        nota +
        " estrela(s).";

}


// ============================
// LOCALIZAÇÃO
// ============================

if (
    navigator.geolocation
) {

    navigator.geolocation.getCurrentPosition(

        function(position) {

            const lat =
                position.coords.latitude;

            const lon =
                position.coords.longitude;


            L.marker([
                lat,
                lon
            ])
            .addTo(map)
            .bindPopup(
                "📍 Você está aqui"
            )
            .openPopup();


            map.setView(
                [lat, lon],
                14
            );

        },

        function() {

            console.log(
                "Localização não disponível."
            );

        }

    );

}
