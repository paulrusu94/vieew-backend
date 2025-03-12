# vieew-backend


Backend App Repo 

## To install backend to a frontend:

-  create next folder structure 

--/view/
    |---/fronted/
    |---/backend/

- clone/fetch new backend changes in backend folder
- in the `tsconfig.json` file from the frontend app, add next configuration:

{
  "compilerOptions": {
    "paths": {
      "@/data-schema": ["../vieew-backend/amplify/data/resource"]
    }
  }
}



## to run this `npx ampx generate outputs --branch <branch> --app-id <your-backend-app-id>` in frontend folder to generate 
