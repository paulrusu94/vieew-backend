# Vieew Backend

## Overview
Backend application repository for the Vieew project.

## Project Structure
The application requires the following folder structure:


## Installation Guide

### Prerequisites
- Node.js and npm installed
- Access to the backend repository
- Valid AWS credentials

### Setup Steps

1. **Create Project Structure**
   - Create a root directory named `view`
   - Create two subdirectories: `frontend` and `backend`

2. **Backend Integration**
   - Clone or fetch the backend repository into the `backend` folder
   - Ensure all dependencies are installed

3. **Frontend Configuration**
   Update the `tsconfig.json` in your frontend application with the following configuration:
   ```json
   {
     "compilerOptions": {
       "paths": {
         "@/data-schema": ["../vieew-backend/amplify/data/resource"]
       }
     }
   }

4. **Generate Backend Configuration** 
    - Run the following command in the frontend folder to generate backend environment configuration:
    ```code
        npx ampx generate outputs --branch <branch> --app-id <your-backend-app-id>
    ```
    Replace:
    <branch> with your target branch name
    <your-backend-app-id> with your actual backend application ID

## Development

### Environment Setup

Ensure you have the correct environment variables and AWS credentials configured before running the application.

## Support
For any issues or questions, please contact the development team.