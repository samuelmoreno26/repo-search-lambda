# Lambda Búsqueda - Microservicio

Este microservicio se encarga de recibir consultas del usuario, buscar coincidencias en la tabla `Productos` de DynamoDB, guardar el historial en la tabla `Búsquedas` y utilizar **Google Gemini AI** para generar sugerencias de compra.

## Pipeline CI/CD
El archivo `.github/workflows/deploy.yml` instala las dependencias npm (`@aws-sdk`, `uuid`, etc.), empaqueta todo en un archivo `.zip` y lo despliega directamente en AWS usando la AWS CLI.

## Secretos Requeridos en GitHub Actions:
- `AWS_ACCESS_KEY_ID`: Credencial AWS
- `AWS_SECRET_ACCESS_KEY`: Credencial secreta AWS

**Nota:** El nombre de la función definido en el script de despliegue de GitHub Actions (`megastore-busqueda`) debe coincidir exactamente con el nombre de la función provisto por el repositorio de Infraestructura (Terraform).
