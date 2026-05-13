const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand, ScanCommand } = require("@aws-sdk/lib-dynamodb");
const { randomUUID } = require("crypto");

const client = new DynamoDBClient({});
const Sentry = require("@sentry/aws-serverless");

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 1.0,
});
Sentry.setTag("module", "busqueda");
Sentry.setTag("team", "backend");

const docClient = DynamoDBDocumentClient.from(client);

// Dummy fallback products if DB is empty
const defaultProducts = [
    { product_id: "1", name: "Laptop Gamer RTX 4060", category: "Laptops", price: 1200 },
    { product_id: "2", name: "Smartphone 5G 128GB", category: "Smartphones", price: 400 },
    { product_id: "3", name: "Teclado Mecánico RGB", category: "Accesorios", price: 80 },
    { product_id: "4", name: "Monitor Curvo 27 pulgadas", category: "Monitores", price: 250 }
];

exports.handler = Sentry.wrapHandler(async (event) => {
    try {
        const queryParams = event.queryStringParameters || {};
        const query = queryParams.q || "";
        const productId = queryParams.product_id || null;
        const userId = queryParams.user_id || "anonymous";

        // Log the search
        const searchId = randomUUID();
        await docClient.send(new PutCommand({
            TableName: process.env.TABLE_BUSQUEDAS,
            Item: {
                search_id: searchId,
                user_id: userId,
                query: query,
                createdAt: new Date().toISOString()
            }
        }));

        // Fetch products (Mock or Scan)
        let products = defaultProducts;
        try {
            const result = await docClient.send(new ScanCommand({
                TableName: process.env.TABLE_PRODUCTOS
            }));
            if (result.Items && result.Items.length > 0) {
                products = result.Items;
            }
        } catch (e) {
            console.log("No products in DB, using fallback");
        }

        // Filter products based on search
        let filteredProducts = products;
        if (query) {
            filteredProducts = products.filter(p => 
                p.name.toLowerCase().includes(query.toLowerCase()) || 
                p.category.toLowerCase().includes(query.toLowerCase())
            );
        }

        // Generate AI Recommendations
        let suggestions = [];
        if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "sk-placeholder") {
            try {
                const { GoogleGenerativeAI } = require("@google/generative-ai");
                const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
                const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
                
                let prompt = `Un usuario está buscando "${query}" en un e-commerce de tecnología. 
                Aquí están nuestros productos: ${JSON.stringify(products.map(p => p.name))}.
                Sugiere 2 productos relevantes basados en su búsqueda e incluye una breve razón amigable (máximo 1 oración por producto). 
                Devuelve la respuesta en formato JSON estricto que contenga un array de objetos con las llaves "name" y "reason" directamente en la raíz, por ejemplo: [{"name": "A", "reason": "B"}]. Asegurate de no incluir formato markdown como \`\`\`json.`;

                if (productId) {
                    const specificProduct = products.find(p => p.product_id === productId);
                    if (specificProduct) {
                        filteredProducts = [specificProduct];
                        prompt = `Un usuario está viendo el detalle del producto "${specificProduct.name}" (Categoría: ${specificProduct.category}, Precio: $${specificProduct.price}).
                        Aquí están otros productos en nuestro catálogo: ${JSON.stringify(products.filter(p => p.product_id !== productId).map(p => p.name))}.
                        Sugiere 3 productos complementarios o alternativos a este producto específico e incluye una breve razón amigable (máximo 1 oración por producto).
                        Devuelve la respuesta en formato JSON estricto que contenga un array de objetos con las llaves "name" y "reason" directamente en la raíz, por ejemplo: [{"name": "A", "reason": "B"}]. Asegurate de no incluir formato markdown como \`\`\`json.`;
                    }
                }
                
                const result = await model.generateContent(prompt);
                const aiMsg = result.response.text();
                
                try {
                    let cleanedMsg = aiMsg.trim();
                    if (cleanedMsg.startsWith("```json")) {
                        cleanedMsg = cleanedMsg.replace(/```json\n?/, "").replace(/```/g, "").trim();
                    }
                    const parsed = JSON.parse(cleanedMsg);
                    suggestions = Array.isArray(parsed) ? parsed : (parsed.suggestions || []);
                } catch(e) {
                    console.error("Failed to parse AI response:", aiMsg);
                }
            } catch (e) {
                console.error("Gemini error:", e);
            }
        } else {
             suggestions = [
                 { name: "Sugerencia Inteligente 1", reason: "Configura la API KEY de Gemini para ver sugerencias reales." },
                 { name: "Oferta Destacada", reason: "Los monitores curvos tienen un 20% de descuento hoy." }
             ];
        }

        return {
            statusCode: 200,
            headers: { 
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            },
            body: JSON.stringify({ 
                results: filteredProducts,
                product: productId ? filteredProducts[0] : null,
                suggestions: suggestions
            })
        };
    } catch (error) {
        console.error("Error:", error);
        return {
            statusCode: 500,
            headers: { 
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            },
            body: JSON.stringify({ message: "Error interno del servidor." })
        };
    }
});
