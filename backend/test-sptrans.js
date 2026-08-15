require("dotenv").config();
const axios = require("axios");

async function testarSPTrans() {
    const token = process.env.SPTRANS_TOKEN;

    try {
        const resposta = await axios.post(
            "https://api.olhovivo.sptrans.com.br/v2.1/Login/Autenticar",
            null,
            {
                params: { token }
            }
        );

        console.log("HTTP:", resposta.status);
        console.log("Resultado:", resposta.data);

    } catch (erro) {
        console.log("HTTP:", erro.response?.status);
        console.log("Resposta:", erro.response?.data);
    }
}

testarSPTrans();
