export type OsType = "talos" | "centos";

export const getDeploymentPaths = (osType: OsType, group: string, indexName: string = "{device}") => {
  return {
    tsv: {
      search: osType === "talos" ? `find /root/data/nfs/pvc-* -type f -name "*.tsv"` : undefined,
      dest: osType === "talos" ? `/root/data/nfs/pvc-*/dsiem-plugin-tsv/` : `/mnt/NAS/dsiem-plugin-tsv/`,
      file: `${group}_plugin-sids.tsv`,
    },
    json: {
      dest: `dsiem-frontend pod: dsiem/configs/`,
      file: `directives_dsiem-backend-0_${group}.json`,
    },
    yaml: {
      dest: `${osType === "talos" ? "/root/data/mgmt" : "/root"}/kubeappl/vector-parser/configs/${indexName}/`,
      file: `70_dsiem-plugin_${group}.yaml`,
    },
    vrl: {
      dest: `${osType === "talos" ? "/root/data/mgmt" : "/root"}/kubeappl/vector-parser/configs/${indexName}/`,
      file: `60_custom-filter_${group}.vrl`,
    }
  };
};
