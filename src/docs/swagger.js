const swaggerJSDoc = require('swagger-jsdoc');

/**
 * Swagger configuration for OpenAPI 3.0 specification
 */
const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'JE Fitness API',
    version: '1.0.0',
    description: 'REST API for JE Fitness application with authentication, user management, and fitness tracking',
    contact: {
      name: 'JE Fitness Team',
      email: 'support@jefitness.com'
    },
    license: {
      name: 'ISC'
    }
  },
  servers: [
    {
      url: 'http://localhost:5000/api/v1',
      description: 'Development server'
    },
    {
      url: 'https://jefitness.com/api/v1',
      description: 'Production server'
    }
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT Authorization header using the Bearer scheme. Example: "Authorization: Bearer {token}"'
      }
    },
    schemas: {
      User: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'User ID'
          },
          firstName: {
            type: 'string',
            description: 'User first name'
          },
          lastName: {
            type: 'string',
            description: 'User last name'
          },
          email: {
            type: 'string',
            format: 'email',
            description: 'User email address'
          },
          role: {
            type: 'string',
            enum: ['user', 'trainer', 'admin'],
            description: 'User role'
          },
          dob: {
            type: 'string',
            format: 'date',
            description: 'Date of birth'
          },
          gender: {
            type: 'string',
            description: 'Gender'
          },
          phone: {
            type: 'string',
            description: 'Phone number'
          },
          activityStatus: {
            type: 'string',
            description: 'Activity status'
          },
          startWeight: {
            type: 'number',
            description: 'Starting weight'
          },
          currentWeight: {
            type: 'number',
            description: 'Current weight'
          },
          goals: {
            type: 'string',
            description: 'Fitness goals'
          },
          reason: {
            type: 'string',
            description: 'Reason for joining'
          },
          createdAt: {
            type: 'string',
            format: 'date-time',
            description: 'Account creation timestamp'
          }
        }
      },
      Error: {
        type: 'object',
        properties: {
          msg: {
            type: 'string',
            description: 'Error message'
          },
          errors: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                msg: {
                  type: 'string'
                },
                param: {
                  type: 'string'
                },
                location: {
                  type: 'string'
                }
              }
            }
          }
        }
      }
    }
  },
  security: [
    {
      bearerAuth: []
    }
  ]
};

const options = {
  swaggerDefinition,
  apis: [
    './src/routes/*.js',
    './src/models/*.js'
  ]
};

const swaggerSpec = swaggerJSDoc(options);

module.exports = swaggerSpec;
