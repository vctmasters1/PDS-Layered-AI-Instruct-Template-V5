#include "pds_fb_ref.h"
#include <stdlib.h>

esp_err_t pds_fb_ref_init(pds_comp_handle_t *out_handle)
{
    pds_fb_ref_t *fb = calloc(1, sizeof(pds_fb_ref_t));
    if (!fb) return ESP_ERR_NO_MEM;
    *out_handle = fb;
    return ESP_OK;
}

void pds_fb_ref_set_source(pds_comp_handle_t handle, const void *source_output)
{
    ((pds_fb_ref_t *)handle)->state.output = source_output;
}

pds_comp_status_t pds_fb_ref_run(pds_comp_handle_t handle)
{
    (void)handle;  /* intentionally empty — output pointer is set once at init */
    return PDS_COMP_IDLE;
}
