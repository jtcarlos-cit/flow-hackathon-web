import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';

import {
  App,
  GitHubSourceCodeProvider,
  Platform,
} from '@aws-cdk/aws-amplify-alpha';

import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import {
  CompositePrincipal,
  ManagedPolicy,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from 'aws-cdk-lib/aws-iam';

export class InfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const role = new Role(this, 'AmplifyRole', {
      assumedBy: new CompositePrincipal(
        new ServicePrincipal('amplify.amazonaws.com'),
        new ServicePrincipal(`amplify.${this.region}.amazonaws.com`)
      ),
      description: 'Custom role permitting resources creation from Amplify',
    });

    const computeRole = new Role(this, 'ComputeAmplifyRole', {
      assumedBy: new CompositePrincipal(
        new ServicePrincipal('amplify.amazonaws.com'),
        new ServicePrincipal('codebuild.amazonaws.com'),
        new ServicePrincipal(`amplify.${this.region}.amazonaws.com`)
      ),
    });

    const iManagedPolicy = ManagedPolicy.fromAwsManagedPolicyName(
      'AdministratorAccess'
    );
    computeRole.addManagedPolicy(iManagedPolicy);
    role.addManagedPolicy(iManagedPolicy);

    //create a new Amplify app
    const amplifyApp = new App(this, 'NextApp', {
      role,
      computeRole,
      sourceCodeProvider: new GitHubSourceCodeProvider({
        owner: 'jtcarlos-cit',
        repository: 'flow-hackathon-web',
        oauthToken: cdk.SecretValue.secretsManager('dev/testapp/github-token', {
          jsonField: 'token',
        }),
      }),
      autoBranchDeletion: true,
      platform: Platform.WEB_COMPUTE, //required for SSR apps
      buildSpec: codebuild.BuildSpec.fromObjectToYaml({
        version: 1,
        frontend: {
          phases: {
            preBuild: {
              commands: ['ls', 'yarn cache clean', 'yarn install'],
            },
            build: {
              commands: ['yarn build'],
            },
          },
          artifacts: {
            baseDirectory: '.next',
            files: ['**/*'],
          },
          cache: {
            paths: ['node_modules/**/*'],
          },
        },
      }),
    });

    // branch to deploy
    let branchName = 'main';
    amplifyApp.addBranch(branchName);

    //outputs the url to both your console and Outputs in the CF stack
    new cdk.CfnOutput(this, 'AmplifyAppUrl', {
      value: `https://${branchName}.${amplifyApp.appId}.amplifyapp.com`,
      description: 'Amplify App URL',
    });
  }
}
