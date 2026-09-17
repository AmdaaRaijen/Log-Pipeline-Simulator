# Talos OS Deployment Guide

The **Talos OS Deployment Guide** provides comprehensive instructions for deploying the SIEM Pipeline Simulator to a Kubernetes cluster running on Talos Linux. Talos is an immutable, API-driven operating system designed specifically for Kubernetes, which requires a slightly different approach for building and managing container images compared to traditional Linux distributions.

## Deployment Workflow

### 1. Build and Push the Container Image
Since Talos OS does not include a local Docker daemon or interactive shell by design, the container image must be built on a separate workstation or CI/CD pipeline and pushed to an accessible container registry.

**Using DockerHub (Public or Private)**
```bash
docker login
docker build -t <dockerhub-username>/pipeline-simulator:latest .
docker push <dockerhub-username>/pipeline-simulator:latest
```

**Using a Local Harbor Registry**
If deploying within an environment that uses a private Harbor registry (e.g., `harbor:443`), tag the image accordingly:
```bash
docker login harbor:443
docker build -t harbor:443/<project>/pipeline-simulator:latest .
docker push harbor:443/<project>/pipeline-simulator:latest
```
*Note: If utilizing `containerd`, substitute `docker` with `nerdctl` or `podman`.*

### 2. Configure the Kubernetes Manifest
The `k8s-deployment.yaml` file defines the standard Kubernetes resources (`Deployment`, `Secret`, and `Service`) required to run the application.

1. **Update Image Reference**: Modify the `image` attribute in the `Deployment` spec to point to the newly pushed image.
```yaml
      containers:
        - name: pipeline-simulator
          image: docker.io/amda23/pipeline-simulator:latest
          imagePullPolicy: Always
```

### 3. Execute the Deployment
Apply the configured manifest to the Talos cluster using `kubectl`:
```bash
kubectl apply -f k8s-deployment.yaml
```

Verify the deployment status:
```bash
kubectl get pods -l app=pipeline-simulator
```
*Troubleshooting Note: A prolonged `ContainerCreating` status generally indicates that the node is actively downloading a large image layer. You can inspect the progress via `kubectl describe pod <pod-name>` under the `Events` section.*

### 4. Network Exposure and Access
Depending on the cluster's network configuration and the intended access model, the application can be exposed using one of the following Service configurations:

#### Option A: LoadBalancer (Recommended)
If the cluster utilizes a LoadBalancer provider (such as MetalLB) and is accessible via a corporate VPN, this is the optimal approach.
- Set `type: LoadBalancer` in the `Service` spec.
- Retrieve the assigned IP using `kubectl get svc pipeline-simulator-svc`.
- Access the application at `http://<EXTERNAL-IP>:3000`.

#### Option B: Port-Forwarding (Development/Testing)
For immediate, secure access without altering networking rules, establish a temporary tunnel directly through the Kubernetes API:
```bash
kubectl port-forward svc/pipeline-simulator-svc 3000:3000
```
- Access the application at `http://localhost:3000`.

#### Option C: NodePort (Direct Node IP Access)
To expose the application directly on the Talos node's IP address (e.g., bypassing load balancers):
- Set `type: NodePort` in the `Service` spec.
- Define a `nodePort` within the standard Kubernetes range (30000-32767), or rely on the control plane to assign one automatically.
```yaml
  ports:
    - protocol: TCP
      port: 3000
      targetPort: 3000
      nodePort: 30000 
  type: NodePort
```
- Access the application at `http://<NODE-IP>:<NODEPORT>`.

### 5. Updating the Application
When new changes are introduced to the source code, the deployed application must be updated to reflect them.

1. **Rebuild and Push the Image**:
Build the updated application and push it to the registry using the same `latest` tag (or a new version tag).
```bash
docker build -t <username>/pipeline-simulator:latest .
docker push <username>/pipeline-simulator:latest
```

2. **Trigger a Rolling Restart**:
Because the `Deployment` is configured with `imagePullPolicy: Always`, Kubernetes will automatically fetch the latest image upon pod creation. Force the deployment to restart its pods to pull the new update seamlessly (without downtime):
```bash
kubectl rollout restart deployment pipeline-simulator
```

Verify the rollout status:
```bash
kubectl rollout status deployment pipeline-simulator
```
